// angelyn
// GET /api/town-councils - the council label layer for the map.
//
// The map's basemap tiles carry Singapore PLANNING AREA names ("Yio Chu Kang",
// "Ang Mo Kio"), which are not town councils - Yio Chu Kang SMC sits inside Ang Mo
// Kio Town Council, so the tiles show two names where the estate has one manager.
// This endpoint gives the map its own label layer so regions can be named by the
// council actually in charge.
//
// Every response echoes boundaries_approximate, because these are circles around
// town centres, not real boundary polygons. The frontend labels the layer from this
// field so the caveat cannot drift away from the data - the same contract
// /api/sensor-surface uses for its simulated layer.
const express = require('express');
const { protect, restrictTo } = require('../middleware/auth');
const { COUNCILS, SG_BOUNDS, BOUNDARIES_ARE_APPROXIMATE } = require('../services/townCouncils');

const router = express.Router();
router.use(protect);

// Readable by any signed-in internal user: this is reference data, not estate data,
// and both the map and the dashboard's council filter need it.
router.get('/', restrictTo('admin', 'staff'), (req, res) => {
  res.json({
    councils: COUNCILS.map(c => ({
      id: c.id,
      name: c.name,
      lat: c.lat,
      lng: c.lng,
      radius_km: c.radiusKm,
      constituencies: c.constituencies || [],
    })),
    total: COUNCILS.length,
    boundaries_approximate: BOUNDARIES_ARE_APPROXIMATE,
    sgBounds: SG_BOUNDS,
  });
});

module.exports = router;
