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

/**
 * Counts for a window, computed with the SAME services the live figures use.
 *
 * This exists so the map's metric cards can show a real trend. It deliberately
 * re-runs computeRiskMap / computeFeedingPoints on the prior window rather than
 * counting rows inline: "high-risk locations" is a derived, severity-weighted
 * figure, and a second hand-rolled definition here would drift from the one the
 * cards display the moment either service changed.
 */
function summarise({ assessments, sightings, windowDays, now }) {
  // `now` is the END of the window being summarised. Both services already take
  // it (they default to Date.now() and filter `t < now - windowDays`), so passing
  // the boundary makes them evaluate exactly [now - windowDays, now] using their
  // OWN window logic - no second filtering rule to drift out of step.
  const map = computeRiskMap({ assessments, windowDays, now });
  const feeding = computeFeedingPoints({ sightings, windowDays, now });
  return {
    totalAssessments: map.totalAssessments,
    mappedCount: map.mappedCount,
    highRiskLocations: map.points.filter(p => p.riskLevel === 'high' || p.riskLevel === 'critical').length,
    feedingTotal: feeding.total,
  };
}

router.get('/', restrictTo('admin', 'staff'), async (req, res) => {
  try {
    const windowDays = Math.min(90, Math.max(7, parseInt(req.query.windowDays) || 30));
    const msWindow = windowDays * 24 * 60 * 60 * 1000;
    const since = new Date(Date.now() - msWindow);
    // The immediately preceding window of EQUAL length, so "vs previous 30 days"
    // compares like with like. Anything older than this is not loaded at all.
    const prevSince = new Date(Date.now() - msWindow * 2);

    // Two layers, one fetch: the rodent risk points (severity-weighted) and the
    // feeding sightings overlaid near them - the spatial view of the correlation.
    // Feeding-tag filtering is JSON-array logic the service owns, so we load
    // feeding candidates by window here and let computeFeedingPoints decide.
    //
    // Both queries reach back over TWO windows and the prior half is split out in
    // memory - one round trip instead of four, and the two halves are guaranteed
    // to come from the same read.
    const [assessments, sightings] = await Promise.all([
      RodentAssessment.findAll({
        where: { is_deleted: false, createdAt: { [Op.gte]: prevSince } },
        attributes: ['id', 'block_number', 'floor_level', 'risk_level', 'gps_lat', 'gps_lng', 'observations', 'createdAt'],
      }),
      FaunaSighting.findAll({
        where: { is_deleted: false, createdAt: { [Op.gte]: prevSince } },
        attributes: ['id', 'block_number', 'floor_level', 'species', 'behaviour_tags', 'gps_lat', 'gps_lng', 'notes', 'createdAt'],
      }),
    ]);

    const inCurrent = r => new Date(r.createdAt) >= since;
    const allAssessments = assessments.map(a => a.toJSON());
    const allSightings = sightings.map(s => s.toJSON());
    const assessmentsJson = allAssessments.filter(inCurrent);
    const sightingsJson = allSightings.filter(inCurrent);
    const prevAssessments = allAssessments.filter(r => !inCurrent(r));
    const prevSightings = allSightings.filter(r => !inCurrent(r));

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

    /**
     * `previous` is the same four figures over the prior window.
     *
     * `has_data` is the honesty gate and the UI must respect it: when the prior
     * window holds no records at all, that is an ABSENCE of history, not a real
     * zero. Rendering "+100% vs previous" off an empty baseline would invent a
     * trend out of a system that simply was not collecting yet.
     */
    const prevHasData = prevAssessments.length > 0 || prevSightings.length > 0;
    const previous = {
      ...summarise({ assessments: prevAssessments, sightings: prevSightings, windowDays, now: since.getTime() }),
      windowDays,
      from: prevSince.toISOString(),
      to: since.toISOString(),
      has_data: prevHasData,
    };

    res.json({ ...map, feeding, previous, coOccurrenceBlocks: correlation.map(b => b.block_number) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'failed to compute rodent risk map' });
  }
});

module.exports = router;
