// angelyn
// Behavioural Diagnosis endpoint - ranks blocks where feeding activity co-occurs
// with rodent risk (see services/blockDiagnosis.js). Cross-domain: it reads the
// real FaunaSighting table AND the real RodentAssessment table, the only place
// the two meet.
const express = require('express');
const { Op } = require('sequelize');
const { FaunaSighting, RodentAssessment } = require('../models');
const { protect, restrictTo } = require('../middleware/auth');
const { computeFeedingRodentCorrelation } = require('../services/blockDiagnosis');

const router = express.Router();
router.use(protect);

router.get('/', restrictTo('manager', 'field_officer'), async (req, res) => {
  try {
    // reviewer can widen/narrow the co-occurrence window, clamped to something sane
    const windowDays = Math.min(90, Math.max(7, parseInt(req.query.windowDays) || 30));
    const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

    // pre-filter in SQL so we never load the whole table; the service re-applies
    // the same window as its own source of truth (keeps it independently testable).
    const [sightings, assessments] = await Promise.all([
      FaunaSighting.findAll({
        where: { is_deleted: false, createdAt: { [Op.gte]: since } },
        attributes: ['block_number', 'behaviour_tags', 'createdAt'],
      }),
      RodentAssessment.findAll({
        where: { is_deleted: false, createdAt: { [Op.gte]: since } },
        attributes: ['block_number', 'risk_level', 'createdAt'],
      }),
    ]);

    const blocks = computeFeedingRodentCorrelation({
      sightings: sightings.map(s => s.toJSON()),
      assessments: assessments.map(a => a.toJSON()),
      windowDays,
    });

    res.json({ windowDays, blocks });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'failed to compute block diagnosis' });
  }
});

module.exports = router;
