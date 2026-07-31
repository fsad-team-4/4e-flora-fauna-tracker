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
const cloudinary = require('../config/cloudinary');
const { RodentAssessment, WorkOrder, WorkOrderEvent, User } = require('../models');
const { protect, restrictTo } = require('../middleware/auth');
const { sendEmail } = require('../services/emailService');
const { recordDispatch } = require('../services/notificationService');
const { STAGES, recordStage, buildPipeline, lastUpdate, isStage } = require('../services/workOrderStages');
const { notifyStageChange } = require('../services/workOrderNotify');
const { draftBriefing } = require('../services/vendorBriefing');
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

// Stage transition. scheduled_for is only meaningful for the 'scheduled' stage
// and is REQUIRED there - the service rejects the stage without it.
const stageSchema = yup.object({
  stage: yup.string().oneOf(STAGES, 'unknown stage').required(),
  note: yup.string().nullable().max(2000),
  scheduled_for: yup.date().nullable(),
  at: yup.date().nullable(),
});

// Site evidence: base64 data URLs, downscaled client-side before they get here.
const photoSchema = yup.object({
  photos: yup.array().of(yup.string().required()).min(1, 'attach at least one photo').max(6).required(),
});

const router = express.Router();
router.use(protect);

// Consolidation exists because "every call-out costs money" (PS 4E brief). This
// is a demo assumption used only to quantify the saving of merging N complaints
// into one visit - not a real EM Services rate.
const CALLOUT_COST_SGD = 80;

// Where a rodent work order is dispatched when the officer chooses to email it.
const CONTRACTOR_EMAIL = process.env.CONTRACTOR_EMAIL || 'pestcontrol@emservices.com.sg';
const DEFAULT_AGENCY = 'Pest Control Contractor';

// Same Cloudinary credentials the rest of the app uses (config/cloudinary.js).
// Server-side only: no key ever reaches the browser.
const hasCloudinary = Boolean(
  process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET
);

// Single-estate PoC: every work order this build raises belongs to one council.
//
// CORRECTED: this was Tanjong Pagar, inferred from the seed's block numbers
// (122-125 are real Kim Tian Road blocks). But the seed's COORDINATES are Ang Mo
// Kio (~1.369, 103.845) - seed.js says so itself ("across an Ang Mo Kio estate")
// - and Kim Tian Road is ~10km away in Tiong Bahru. The pins are the stronger
// evidence of where this estate is, so the council follows them.
//
// EM Services serves 10 of Singapore's 19 town councils, so a real deployment IS
// multi-council; that is why town_council is a per-work-order column and not a
// global constant, and why this default is env-overridable. Rows raised before this feature stay null and
// render "not recorded" rather than being back-filled with an assumption.
const DEFAULT_TOWN_COUNCIL = process.env.TOWN_COUNCIL || 'Ang Mo Kio Town Council';

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

// GET / - raised work orders (audit history).
// ?status= accepts any pipeline stage; 'open' is kept as a legacy alias meaning
// "not closed", so existing callers keep working after the open/closed change.
router.get('/', restrictTo('admin', 'staff'), async (req, res) => {
  try {
    const where = { is_deleted: false };
    const q = req.query.status;
    if (q === 'open') where.status = { [Op.ne]: 'closed' };
    else if (isStage(q)) where.status = q;

    const rows = await WorkOrder.findAll({
      where,
      order: [['createdAt', 'DESC']],
      limit: 100,
      include: [{ model: WorkOrderEvent, as: 'events', required: false }],
    });

    // Reporter names come from the officers who filed the consolidated
    // assessments. Resolved in one query rather than N, and only for the ids
    // actually present.
    const allIds = rows.flatMap(w => (Array.isArray(w.assessment_ids) ? w.assessment_ids : []));
    const reporterByWo = new Map();
    if (allIds.length) {
      const assessments = await RodentAssessment.findAll({
        where: { id: { [Op.in]: allIds } },
        attributes: ['id', 'assessed_by'],
        include: [{ model: User, as: 'assessor', attributes: ['id', 'name'], required: false }],
      });
      const nameById = new Map(assessments.map(a => [a.id, a.assessor?.name || null]));
      for (const w of rows) {
        const ids = Array.isArray(w.assessment_ids) ? w.assessment_ids : [];
        const names = [...new Set(ids.map(i => nameById.get(i)).filter(Boolean))];
        reporterByWo.set(w.id, names);
      }
    }

    res.json(rows.map(w => {
      const events = w.events || [];
      const reporters = reporterByWo.get(w.id) || [];
      return {
        ...w.toJSON(),
        events: undefined, // the pipeline below is the shape the UI consumes
        pipeline: buildPipeline(w, events),
        last_update: lastUpdate(w, events),
        reporters,
        reporter_name: reporters[0] || null,
        photo_count: Array.isArray(w.photo_urls) ? w.photo_urls.length : 0,
        call_outs_avoided: Math.max(0, (w.consolidated_count || 1) - 1),
        est_savings: Math.max(0, (w.consolidated_count || 1) - 1) * CALLOUT_COST_SGD,
      };
    }));
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
    const assessments = await RodentAssessment.findAll({
      where: { work_order_id: wo.id },
      include: [{ model: User, as: 'assessor', attributes: ['id', 'name'], required: false }],
    });
    const events = await WorkOrderEvent.findAll({
      where: { work_order_id: wo.id },
      order: [['at', 'ASC']],
    });
    res.json({
      ...wo.toJSON(),
      assessments,
      events,
      pipeline: buildPipeline(wo, events),
      last_update: lastUpdate(wo, events),
      reporters: [...new Set(assessments.map(a => a.assessor?.name).filter(Boolean))],
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'failed to load work order' });
  }
});

// POST / - approve & raise a work order for a consolidated set of assessments.
// This is the human approval step: nothing here runs without an officer's call.
// Approving commits money, so this is admin-only. Officers (staff) see
// everything and move the non-financial stages via PATCH /:id/stage.
router.post('/', restrictTo('admin'), validateBody(approveSchema), async (req, res) => {
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
      status: 'raised',
      town_council: DEFAULT_TOWN_COUNCIL,
      notes: notes || null,
      approved_by: req.user.user_id,
      approved_by_name: req.user.name || null,
    });

    // the first scan: 'raised' is a real logged event with a time and an actor
    await WorkOrderEvent.create({
      work_order_id: wo.id,
      stage: 'raised',
      at: wo.createdAt || new Date(),
      actor_id: req.user.user_id,
      actor_name: req.user.name || null,
      note: notes || null,
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
      await wo.update({
        dispatched_to: CONTRACTOR_EMAIL,
        email_status: emailStatus,
        status: 'dispatched',
        dispatched_at: new Date(),
        dispatched_by: req.user.user_id,
        dispatched_by_name: req.user.name || null,
      });
      await WorkOrderEvent.create({
        work_order_id: wo.id,
        stage: 'dispatched',
        at: new Date(),
        actor_id: req.user.user_id,
        actor_name: req.user.name || null,
        // the note records the REAL outcome, so a failed send never reads as sent
        note: emailStatus === 'sent' ? `Emailed ${CONTRACTOR_EMAIL}` : `Email to ${CONTRACTOR_EMAIL} failed: ${emailError}`,
      });
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

/**
 * PATCH /:id/stage - move the order along the pipeline.
 *
 * Non-financial stages, so staff may record them. Every call writes an
 * append-only WorkOrderEvent; the service refuses backwards moves and refuses
 * 'scheduled' without a real date. Resident notification is attempted after the
 * stage is committed and its true outcome is returned - a mail failure never
 * rolls back a stage that genuinely happened.
 */
router.patch('/:id/stage', restrictTo('admin', 'staff'), validateBody(stageSchema), async (req, res) => {
  const { stage, note, scheduled_for, at } = req.body;
  try {
    const wo = await WorkOrder.findOne({ where: { id: req.params.id, is_deleted: false } });
    if (!wo) return res.status(404).json({ error: 'not found' });

    const result = await recordStage(wo, {
      stage, note, at, scheduledFor: scheduled_for, actor: req.user,
    });
    if (result.error) return res.status(result.code || 400).json({ error: result.error });

    const notified = await notifyStageChange(wo, stage);
    const events = await WorkOrderEvent.findAll({ where: { work_order_id: wo.id }, order: [['at', 'ASC']] });

    res.json({
      ...wo.toJSON(),
      pipeline: buildPipeline(wo, events),
      last_update: lastUpdate(wo, events),
      notified,
    });
  } catch (err) {
    console.error('stage transition failed:', err);
    res.status(500).json({ error: 'failed to update work order stage' });
  }
});

// PATCH /:id/close - closing terminates a paid engagement, so it stays admin.
// Delegates to the same stage machine so it is logged like every other scan.
router.patch('/:id/close', restrictTo('admin'), async (req, res) => {
  try {
    const wo = await WorkOrder.findOne({ where: { id: req.params.id, is_deleted: false } });
    if (!wo) return res.status(404).json({ error: 'not found' });
    if (wo.status === 'closed') return res.status(400).json({ error: 'work order already closed' });

    const result = await recordStage(wo, { stage: 'closed', actor: req.user, note: req.body?.note || null });
    if (result.error) return res.status(result.code || 400).json({ error: result.error });

    const notified = await notifyStageChange(wo, 'closed');
    res.json({ ...wo.toJSON(), notified });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'failed to close work order' });
  }
});

/**
 * POST /:id/photos - attach site evidence.
 *
 * Upload is SERVER-SIDE: the browser sends downscaled base64 and never sees a
 * Cloudinary credential. Failure is non-fatal and explicit - the work order is
 * untouched and the response names which photos were not stored, so the UI can
 * say so rather than render a broken image.
 */
router.post('/:id/photos', restrictTo('admin', 'staff'), validateBody(photoSchema), async (req, res) => {
  try {
    const wo = await WorkOrder.findOne({ where: { id: req.params.id, is_deleted: false } });
    if (!wo) return res.status(404).json({ error: 'not found' });

    if (!hasCloudinary) {
      return res.status(200).json({
        ...wo.toJSON(),
        stored: 0,
        failed: req.body.photos.length,
        photo_error: 'image storage is not configured, so the photos were not saved',
      });
    }

    const stored = [];
    const failures = [];
    for (const [i, dataUrl] of req.body.photos.entries()) {
      try {
        const uploaded = await cloudinary.uploader.upload(dataUrl, {
          folder: 'work-order-evidence',
          resource_type: 'image',
        });
        stored.push(uploaded.secure_url);
      } catch (e) {
        console.error(`work order photo ${i + 1} upload failed (work order kept):`, e.message);
        failures.push({ index: i, error: e.message });
      }
    }

    if (stored.length) {
      await wo.update({ photo_urls: [...(wo.photo_urls || []), ...stored] });
    }

    res.json({
      ...wo.toJSON(),
      stored: stored.length,
      failed: failures.length,
      photo_error: failures.length
        ? `${failures.length} of ${req.body.photos.length} photo(s) could not be stored`
        : null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'failed to attach photos' });
  }
});

/**
 * POST /:id/briefing - AI-draft a contractor brief.
 *
 * Drafts ONLY. It saves the text on the work order for a human to review and
 * edit; it never emails anyone and is not on the dispatch path.
 */
router.post('/:id/briefing', restrictTo('admin', 'staff'), async (req, res) => {
  try {
    const wo = await WorkOrder.findOne({ where: { id: req.params.id, is_deleted: false } });
    if (!wo) return res.status(404).json({ error: 'not found' });

    const assessments = await RodentAssessment.findAll({
      where: { work_order_id: wo.id },
      order: [['createdAt', 'DESC']],
    });
    const { text, stubbed, error } = await draftBriefing(wo, assessments);
    if (error) return res.status(400).json({ error });

    await wo.update({ vendor_briefing: text, vendor_briefing_at: new Date() });
    res.json({
      id: wo.id,
      vendor_briefing: text,
      vendor_briefing_at: wo.vendor_briefing_at,
      // surfaced so the UI can label a template as a template, not an AI draft
      stubbed,
      draft_only: true,
    });
  } catch (err) {
    console.error('vendor briefing failed:', err);
    res.status(500).json({ error: 'failed to draft the contractor briefing' });
  }
});

module.exports = router;
