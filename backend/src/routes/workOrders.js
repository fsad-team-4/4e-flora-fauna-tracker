// angelyn
// Human-in-the-loop action queue for rodent escalations.
//
// The rodent AI flags escalate_to_contractor on an assessment - that is a
// RECOMMENDATION only. This router is the review gate the brief requires: an
// officer sees pending escalations grouped by block, consolidates the ones that
// belong to the same call-out, and explicitly approves before any contractor is
// engaged. A work order is never raised automatically.
const express = require('express');
const yup = require('yup');
const { Op } = require('sequelize');
const { RodentAssessment, WorkOrder } = require('../models');
const { protect, restrictTo } = require('../middleware/auth');
const { sendEmail } = require('../services/emailService');
const { recordDispatch } = require('../services/notificationService');
const { validateBody } = require('../utils/validate');

const idList = yup.array().of(yup.number().integer().positive()).min(1, 'select at least one report').required();
const approveSchema = yup.object({
  assessment_ids: idList,
  dispatch: yup.boolean(),
  notes: yup.string().nullable().max(2000),
  target_agency: yup.string().nullable().max(200),
});
const dismissSchema = yup.object({
  assessment_ids: idList,
  note: yup.string().nullable().max(2000),
});
const undismissSchema = yup.object({ assessment_ids: idList });

const router = express.Router();
router.use(protect);

// Consolidation exists because "every call-out costs money" (PS 4E brief). This
// is a demo assumption used only to quantify the saving of merging N complaints
// into one visit - not a real EM Services rate.
const CALLOUT_COST_SGD = 80;

// Where a rodent work order is dispatched when the officer chooses to email it.
const CONTRACTOR_EMAIL = process.env.CONTRACTOR_EMAIL || 'pestcontrol@emservices.com.sg';
const DEFAULT_AGENCY = 'Pest Control Contractor';

const RISK_ORDER = { low: 0, medium: 1, high: 2, critical: 3 };
function highestRisk(levels) {
  return levels.reduce((top, lv) => (RISK_ORDER[lv] > RISK_ORDER[top] ? lv : top), 'low');
}

// One assessment is "pending" in the queue when the AI recommended escalation and
// no officer has acted on it yet (not consolidated, not dismissed, not deleted).
const PENDING_WHERE = {
  escalate_to_contractor: true,
  work_order_id: null,
  escalation_status: null,
  is_deleted: false,
};

function blockLabel(block) {
  return block && block.trim() ? block.trim() : '(No block specified)';
}

// GET /queue - pending escalations grouped by block, most urgent first.
router.get('/queue', restrictTo('admin', 'staff'), async (req, res) => {
  try {
    const rows = await RodentAssessment.findAll({
      where: PENDING_WHERE,
      order: [['createdAt', 'DESC']],
    });

    const groups = new Map();
    for (const r of rows) {
      const key = blockLabel(r.block_number);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(r);
    }

    const clusters = [...groups.entries()].map(([block, items]) => {
      const risk = highestRisk(items.map(i => i.risk_level || 'low'));
      const callOutsAvoided = items.length - 1; // N complaints -> 1 visit
      return {
        block,
        count: items.length,
        risk_level: risk,
        call_outs_avoided: callOutsAvoided,
        est_savings: callOutsAvoided * CALLOUT_COST_SGD,
        assessments: items.map(i => ({
          id: i.id,
          createdAt: i.createdAt,
          risk_level: i.risk_level,
          observations: i.observations,
          likely_cause: i.likely_cause,
          image_url: i.image_url,
          floor_level: i.floor_level,
        })),
      };
    });

    // most urgent block first, then the biggest cluster (most consolidation value)
    clusters.sort((a, b) => RISK_ORDER[b.risk_level] - RISK_ORDER[a.risk_level] || b.count - a.count);

    const totalPending = rows.length;
    const totalAvoidable = clusters.reduce((s, c) => s + c.call_outs_avoided, 0);
    res.json({
      clusters,
      totals: {
        pending: totalPending,
        blocks: clusters.length,
        call_outs_avoidable: totalAvoidable,
        est_savings: totalAvoidable * CALLOUT_COST_SGD,
        callout_cost: CALLOUT_COST_SGD,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'failed to load escalation queue' });
  }
});

// GET / - raised work orders (audit history). Optional ?status=open|closed
router.get('/', restrictTo('admin', 'staff'), async (req, res) => {
  try {
    const where = { is_deleted: false };
    if (['open', 'closed'].includes(req.query.status)) where.status = req.query.status;
    const rows = await WorkOrder.findAll({ where, order: [['createdAt', 'DESC']], limit: 100 });
    res.json(rows.map(w => ({
      ...w.toJSON(),
      call_outs_avoided: Math.max(0, (w.consolidated_count || 1) - 1),
      est_savings: Math.max(0, (w.consolidated_count || 1) - 1) * CALLOUT_COST_SGD,
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'failed to load work orders' });
  }
});

// GET /:id - one work order with its consolidated assessments
router.get('/:id', restrictTo('admin', 'staff'), async (req, res) => {
  try {
    const wo = await WorkOrder.findOne({ where: { id: req.params.id, is_deleted: false } });
    if (!wo) return res.status(404).json({ error: 'not found' });
    const assessments = await RodentAssessment.findAll({ where: { work_order_id: wo.id } });
    res.json({ ...wo.toJSON(), assessments });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'failed to load work order' });
  }
});

// POST / - approve & raise a work order for a consolidated set of assessments.
// This is the human approval step: nothing here runs without an officer's call.
router.post('/', restrictTo('admin', 'staff'), validateBody(approveSchema), async (req, res) => {
  const { assessment_ids, dispatch, notes, target_agency } = req.body;
  try {
    // only consolidate assessments that are genuinely still pending - guards
    // against a stale queue double-actioning the same complaint.
    const items = await RodentAssessment.findAll({
      where: { ...PENDING_WHERE, id: { [Op.in]: assessment_ids } },
    });
    if (items.length === 0) {
      return res.status(400).json({ error: 'none of those assessments are pending escalation' });
    }

    const block = items.find(i => i.block_number && i.block_number.trim())?.block_number || null;
    const risk = highestRisk(items.map(i => i.risk_level || 'low'));
    const agency = (target_agency && target_agency.trim()) || DEFAULT_AGENCY;

    const wo = await WorkOrder.create({
      block_number: block,
      animal_type: 'rodent',
      target_agency: agency,
      assessment_ids: items.map(i => i.id),
      consolidated_count: items.length,
      risk_level: risk,
      status: 'open',
      notes: notes || null,
      approved_by: req.user.user_id,
      approved_by_name: req.user.name || null,
    });

    // link the assessments so they leave the queue
    await RodentAssessment.update(
      { work_order_id: wo.id },
      { where: { id: { [Op.in]: items.map(i => i.id) } } }
    );

    // Optional dispatch. Kept non-fatal (like the photo upload): a mail failure
    // must not undo a valid approval, and no SMTP config just logs to console.
    if (dispatch) {
      const subject = `Rodent control call-out - ${block || 'unspecified block'} (${risk} risk)`;
      const body = [
        `A rodent control call-out has been approved by ${req.user.name || 'an estate officer'}.`,
        '',
        `Location: ${block || 'not specified'}`,
        `Risk level: ${risk}`,
        `Consolidated reports: ${items.length}`,
        '',
        'Reported observations:',
        ...items.map((i, n) => `  ${n + 1}. ${i.observations}`),
        notes ? `\nOfficer notes: ${notes}` : '',
      ].join('\n');

      let emailStatus = 'sent';
      let emailError = null;
      try {
        await sendEmail({ to: CONTRACTOR_EMAIL, subject, body });
      } catch (e) {
        console.error('work order dispatch email failed (work order kept):', e.message);
        emailStatus = 'failed';
        emailError = e.message;
      }
      await wo.update({ dispatched_to: CONTRACTOR_EMAIL, dispatched_at: new Date(), email_status: emailStatus });
      // record on the shared notification timeline (resend-able, source-linked back
      // to this work order, and mirrored to the client's webhook)
      await recordDispatch({
        channel: 'email',
        recipient: CONTRACTOR_EMAIL,
        subject,
        body,
        status: emailStatus,
        error_reason: emailError,
        severity: risk,
        source_type: 'work_order',
        source_id: wo.id,
      });
    }

    res.status(201).json({
      ...wo.toJSON(),
      call_outs_avoided: Math.max(0, items.length - 1),
      est_savings: Math.max(0, items.length - 1) * CALLOUT_COST_SGD,
    });
  } catch (err) {
    console.error('raise work order failed:', err);
    res.status(500).json({ error: 'failed to raise work order' });
  }
});

// POST /dismiss - officer reviews a cluster and decides no call-out is warranted
// (false alarm, will monitor, etc). Records the decision as an audit trail.
router.post('/dismiss', restrictTo('admin', 'staff'), validateBody(dismissSchema), async (req, res) => {
  const { assessment_ids, note } = req.body;
  try {
    const [count] = await RodentAssessment.update(
      {
        escalation_status: 'dismissed',
        escalation_note: note || null,
        escalation_decided_by: req.user.user_id,
        escalation_decided_at: new Date(),
      },
      { where: { ...PENDING_WHERE, id: { [Op.in]: assessment_ids } } }
    );
    res.json({ dismissed: count });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'failed to dismiss escalations' });
  }
});

// POST /undismiss - reverse a dismissal (the "Undo" affordance), putting the
// reports back in the pending queue and clearing the decision audit.
router.post('/undismiss', restrictTo('admin', 'staff'), validateBody(undismissSchema), async (req, res) => {
  const { assessment_ids } = req.body;
  try {
    const [count] = await RodentAssessment.update(
      { escalation_status: null, escalation_note: null, escalation_decided_by: null, escalation_decided_at: null },
      { where: { escalation_status: 'dismissed', is_deleted: false, id: { [Op.in]: assessment_ids } } }
    );
    res.json({ restored: count });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'failed to restore escalations' });
  }
});

// PATCH /:id/close - mark a raised work order complete
router.patch('/:id/close', restrictTo('admin', 'staff'), async (req, res) => {
  try {
    const wo = await WorkOrder.findOne({ where: { id: req.params.id, is_deleted: false } });
    if (!wo) return res.status(404).json({ error: 'not found' });
    if (wo.status === 'closed') return res.status(400).json({ error: 'work order already closed' });
    await wo.update({
      status: 'closed',
      closed_by: req.user.user_id,
      closed_by_name: req.user.name || null,
      closed_at: new Date(),
    });
    res.json(wo);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'failed to close work order' });
  }
});

module.exports = router;
