// angelyn
// Address lookup for the assessment intake form.
//
// WHY THIS IS A SEARCH ENDPOINT AND NOT A GEOCODER:
// services/onemapGeocode.js refuses anything it cannot verify, because it runs
// unattended over stored strings and a wrong coordinate there is silent. This
// endpoint is the opposite situation - a human is looking at the results and
// choosing one. The officer picking "128 LORONG 1 TOA PAYOH" IS the
// verification, so the job here is to show real candidates and never to decide.
//
// It therefore returns OneMap's matches as-is, each with its full address and
// postal code so the officer can tell them apart, and picks nothing by default.
const express = require('express');
const { protect, restrictTo } = require('../middleware/auth');

const ONEMAP_SEARCH = 'https://www.onemap.gov.sg/api/common/elastic/search';

const router = express.Router();
router.use(protect);

router.get('/search', restrictTo('manager', 'field_officer'), async (req, res) => {
  const q = String(req.query.q || '').trim();
  // Two characters matches half of Singapore; the officer is still typing.
  if (q.length < 3) return res.json({ query: q, results: [] });

  try {
    const url = `${ONEMAP_SEARCH}?searchVal=${encodeURIComponent(q)}&returnGeom=Y&getAddrDetails=Y&pageNum=1`;
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return res.status(502).json({ error: `address lookup unavailable (HTTP ${r.status})` });
    const data = await r.json();

    const results = (Array.isArray(data?.results) ? data.results : [])
      // A result with no coordinate cannot fill the location field, so it is not
      // offered - picking it would look like it worked and silently do nothing.
      .filter(x => Number.isFinite(Number(x.LATITUDE)) && Number.isFinite(Number(x.LONGITUDE)))
      .slice(0, 8)
      .map(x => ({
        block: x.BLK_NO || null,
        road: x.ROAD_NAME || null,
        postal: x.POSTAL && x.POSTAL !== 'NIL' ? x.POSTAL : null,
        label: x.ADDRESS || `${x.BLK_NO || ''} ${x.ROAD_NAME || ''}`.trim(),
        lat: Number(x.LATITUDE),
        lng: Number(x.LONGITUDE),
      }));

    res.json({
      query: q,
      results,
      // Stated on the wire so no consumer can mistake a block centroid for the
      // spot an officer stood on.
      precision: 'block',
      source: 'OneMap (Singapore Land Authority)',
    });
  } catch (e) {
    console.error('onemap search failed:', e.message);
    res.status(502).json({ error: 'address lookup unavailable' });
  }
});

module.exports = router;
