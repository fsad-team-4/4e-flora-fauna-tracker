// angelyn
// Rodent Risk Map endpoint - severity-weighted geographic points from rodent
// assessments that carry a reported coordinate (see services/rodentRiskMap.js).
const express = require('express');
const { Op } = require('sequelize');
const { RodentAssessment, FaunaSighting } = require('../models');
const { protect, restrictTo } = require('../middleware/auth');
const { computeRiskMap } = require('../services/rodentRiskMap');
const { computeFeedingPoints } = require('../services/feedingPoints');
const { computeFeedingRodentCorrelation, blockKey } = require('../services/blockDiagnosis');

const router = express.Router();
router.use(protect);

router.get('/', restrictTo('admin', 'staff'), async (req, res) => {
  try {
    const windowDays = Math.min(90, Math.max(7, parseInt(req.query.windowDays) || 30));
    const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

    // Two layers, one fetch: the rodent risk points (severity-weighted) and the
    // feeding sightings overlaid near them - the spatial view of the correlation.
    // Feeding-tag filtering is JSON-array logic the service owns, so we load
    // feeding candidates by window here and let computeFeedingPoints decide.
    const [assessments, sightings] = await Promise.all([
      RodentAssessment.findAll({
        where: { is_deleted: false, createdAt: { [Op.gte]: since } },
        attributes: ['id', 'block_number', 'floor_level', 'risk_level', 'gps_lat', 'gps_lng', 'observations', 'createdAt'],
      }),
      FaunaSighting.findAll({
        where: { is_deleted: false, createdAt: { [Op.gte]: since } },
        attributes: ['id', 'block_number', 'floor_level', 'species', 'behaviour_tags', 'gps_lat', 'gps_lng', 'notes', 'createdAt'],
      }),
    ]);

    const assessmentsJson = assessments.map(a => a.toJSON());
    const sightingsJson = sightings.map(s => s.toJSON());

    const map = computeRiskMap({ assessments: assessmentsJson, windowDays });
    const feeding = computeFeedingPoints({ sightings: sightingsJson, windowDays });

    // Reuse the Behavioural Diagnosis correlation (blocks where feeding AND rodent
    // both appear in-window) to tag which points sit at a co-occurrence block, so
    // the map can highlight exactly what that service already flags - no new
    // spatial inference, no invented radius. Matched on the same normalised key.
    const correlation = computeFeedingRodentCorrelation({ sightings: sightingsJson, assessments: assessmentsJson, windowDays });
    const coKeys = new Set(correlation.map(b => blockKey(b.block_number)));
    map.points.forEach(p => { p.coOccurs = coKeys.has(blockKey(p.block)); });
    feeding.points.forEach(p => { p.coOccurs = coKeys.has(blockKey(p.block)); });

    res.json({ ...map, feeding, coOccurrenceBlocks: correlation.map(b => b.block_number) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'failed to compute rodent risk map' });
  }
});

module.exports = router;
