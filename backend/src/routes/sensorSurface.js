// angelyn
// GET /api/sensor-surface - the SIMULATED RATSENSE activity surface.
//
// Deliberately its own route and its own response shape. The real assessment
// points are served by /api/rodent-riskmap and the two are never merged: one
// response carrying both would make it far too easy for a consumer to render
// simulated and reported data with the same treatment.
//
// Every response echoes is_simulated: true. The frontend labels the layer from
// this field, so the label cannot drift away from the data.
const express = require('express');
const { Op } = require('sequelize');
const { SensorReading } = require('../models');
const { protect, restrictTo } = require('../middleware/auth');
const { computeSensorSurface, MAX_GRID } = require('../services/sensorSurface');
const { councilNames, BOUNDARIES_ARE_APPROXIMATE, SG_BOUNDS } = require('../services/townCouncils');

const router = express.Router();
router.use(protect);

const DAY_MS = 24 * 60 * 60 * 1000;

router.get('/', restrictTo('admin', 'staff'), async (req, res) => {
  try {
    const windowDays = Math.min(90, Math.max(1, parseInt(req.query.windowDays) || 30));
    // Cap follows MAX_GRID in the service: the surface is contoured client-side,
    // so it needs a fine grid to read as a field rather than tiles.
    const gridResolution = Math.min(MAX_GRID, Math.max(8, parseInt(req.query.gridResolution) || 180));
    const asOf = req.query.asOf ? new Date(req.query.asOf) : new Date();
    if (Number.isNaN(asOf.getTime())) return res.status(400).json({ error: 'invalid asOf' });
    const councils = req.query.councils
      ? String(req.query.councils).split(',').map(s => s.trim()).filter(Boolean)
      : null;

    // is_simulated: true is pinned in the WHERE clause, not assumed from the
    // column default - if a real vendor feed ever lands in this table, this
    // endpoint keeps serving only the simulated layer until someone decides
    // deliberately otherwise.
    const readings = await SensorReading.findAll({
      where: {
        is_simulated: true,
        recorded_at: { [Op.gte]: new Date(asOf.getTime() - windowDays * DAY_MS), [Op.lte]: asOf },
      },
      order: [['recorded_at', 'ASC']],
    });

    const surface = computeSensorSurface({
      readings: readings.map(r => r.toJSON()),
      asOf,
      gridResolution,
      councils,
    });

    res.json({
      ...surface,
      windowDays,
      // restated on the envelope so a consumer reading only the top level still
      // sees what this is
      is_simulated: true,
      disclosure: 'Simulated sensor data (pilot integration not yet live)',
      boundaries_approximate: BOUNDARIES_ARE_APPROXIMATE,
      availableCouncils: councilNames(),
      sgBounds: SG_BOUNDS,
    });
  } catch (err) {
    console.error('sensor surface failed:', err);
    res.status(500).json({ error: 'failed to compute the sensor surface' });
  }
});

module.exports = router;
