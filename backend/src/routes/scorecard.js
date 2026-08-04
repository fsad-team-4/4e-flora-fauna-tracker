// angelyn
// Prevention Scorecard endpoint - measures whether Layer 1's approved work orders
// actually reduced rodent recurrence (see services/preventionScorecard.js).
const express = require('express');
const { RodentAssessment, WorkOrder } = require('../models');
const { protect, restrictTo } = require('../middleware/auth');
const { computeScorecard } = require('../services/preventionScorecard');

const router = express.Router();
router.use(protect);

router.get('/', restrictTo('manager', 'field_officer'), async (req, res) => {
  try {
    const assessments = await RodentAssessment.findAll({
      where: { is_deleted: false },
      attributes: ['id', 'block_number', 'createdAt'],
    });
    const workOrders = await WorkOrder.findAll({ where: { is_deleted: false } });

    // let a reviewer widen/narrow the follow-up window, clamped to something sane
    const windowDays = Math.min(60, Math.max(3, parseInt(req.query.windowDays) || 14));
    // the weekly trend horizon the scorecard page's selector drives. computeScorecard
    // already accepted this; it just was not reachable from the query before.
    const trendWeeks = Math.min(26, Math.max(4, parseInt(req.query.trendWeeks) || 8));

    const scorecard = computeScorecard({
      assessments: assessments.map(a => a.toJSON()),
      workOrders: workOrders.map(w => w.toJSON()),
      now: Date.now(),
      windowDays,
      trendWeeks,
    });
    res.json(scorecard);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'failed to compute prevention scorecard' });
  }
});

module.exports = router;
