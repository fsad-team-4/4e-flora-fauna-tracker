const { geocodeBlock, normalise, blockNumberOf, streetPartOf } = require('../../src/services/onemapGeocode');

// A stub standing in for OneMap. Every payload here is the SHAPE the live API
// actually returned when probed - including the wrong answers, which are the
// whole reason the guard exists.
function stub(results, { ok = true, status = 200 } = {}) {
  return async () => ({ ok, status, json: async () => ({ found: results.length, results }) });
}
const hit = (blk, road, lat, lng, postal = '310128') => ({
  BLK_NO: blk, ROAD_NAME: road, LATITUDE: String(lat), LONGITUDE: String(lng), POSTAL: postal,
});

describe('parsing estate block strings', () => {
  test('pulls the block number out of estate shorthand', () => {
    expect(blockNumberOf('Blk 79 Toa Payoh Lor 4')).toBe('79');
    expect(blockNumberOf('Block 128')).toBe('128');
    expect(blockNumberOf('846 Yishun Ring Road')).toBe('846');
    expect(blockNumberOf('12A Bedok North')).toBe('12A');
  });

  test('a bare block number has no street part', () => {
    expect(streetPartOf('Block 128')).toBeNull();
    expect(streetPartOf('Blk 350')).toBeNull();
    expect(streetPartOf('23')).toBeNull();
  });

  test('abbreviations are EXPANDED, never dropped', () => {
    // dropping "Lor" would leave "79 Toa Payoh 4" - a different, weaker query
    expect(normalise('Blk 79 Toa Payoh Lor 4').query).toBe('79 Toa Payoh Lorong 4');
    expect(normalise('846 Yishun Ring Rd').query).toBe('846 Yishun Ring Road');
  });
});

describe('geocodeBlock - the guard', () => {
  test('a bare block number is REFUSED without calling OneMap', async () => {
    // The critical case. "Block 350" resolved to 143 Potong Pasir Avenue 2 on the
    // live API - a confident, wrong answer. It must never reach the network.
    let called = false;
    const spy = async () => { called = true; throw new Error('should not be called'); };
    const r = await geocodeBlock('Block 350', { fetchImpl: spy });
    expect(r.matched).toBe(false);
    expect(called).toBe(false);
    expect(r.reason).toMatch(/no street name/i);
  });

  test('a result for a DIFFERENT block is refused', async () => {
    // exactly the live failure: asked for 350, offered 143
    const r = await geocodeBlock('350 Somewhere Road', {
      fetchImpl: stub([hit('143', 'POTONG PASIR AVENUE 2', 1.3329, 103.8661)]),
    });
    expect(r.matched).toBe(false);
    expect(r.reason).toMatch(/was block 143, not 350/i);
    expect(r.lat).toBeUndefined();
  });

  test('a matching block number is accepted, and flagged block-level', async () => {
    const r = await geocodeBlock('846 Yishun Ring Rd', {
      fetchImpl: stub([hit('846', 'YISHUN RING ROAD', 1.41678634718118, 103.834641579241, '760846')]),
    });
    expect(r.matched).toBe(true);
    expect(r.lat).toBeCloseTo(1.41678, 4);
    expect(r.lng).toBeCloseTo(103.83464, 4);
    expect(r.address).toBe('846 YISHUN RING ROAD');
    expect(r.postal).toBe('760846');
    // never presented as the observed spot
    expect(r.precision).toBe('block');
  });

  test('the right block is picked even when it is not the first result', async () => {
    const r = await geocodeBlock('79 Toa Payoh Lor 4', {
      fetchImpl: stub([
        hit('791', 'SOMEWHERE ELSE', 1.1, 103.1),
        hit('79', 'TOA PAYOH LORONG 4', 1.3378, 103.8443),
      ]),
    });
    expect(r.matched).toBe(true);
    expect(r.address).toBe('79 TOA PAYOH LORONG 4');
  });

  test('an empty result set is refused rather than approximated', async () => {
    const r = await geocodeBlock('999 Nowhere Road', { fetchImpl: stub([]) });
    expect(r.matched).toBe(false);
    expect(r.reason).toMatch(/no OneMap result/i);
  });

  test('a non-numeric coordinate is refused', async () => {
    const r = await geocodeBlock('846 Yishun Ring Rd', {
      fetchImpl: stub([{ BLK_NO: '846', ROAD_NAME: 'YISHUN RING ROAD', LATITUDE: 'NIL', LONGITUDE: 'NIL' }]),
    });
    expect(r.matched).toBe(false);
    expect(r.reason).toMatch(/no usable coordinate/i);
  });

  test('an API error reports the failure rather than returning a guess', async () => {
    const down = await geocodeBlock('846 Yishun Ring Rd', { fetchImpl: stub([], { ok: false, status: 503 }) });
    expect(down.matched).toBe(false);
    expect(down.reason).toMatch(/HTTP 503/);

    const boom = await geocodeBlock('846 Yishun Ring Rd', {
      fetchImpl: async () => { throw new Error('network down'); },
    });
    expect(boom.matched).toBe(false);
    expect(boom.reason).toMatch(/unreachable/i);
  });

  test('every refusal carries a reason and no coordinate', async () => {
    const cases = [
      await geocodeBlock('Block 128', { fetchImpl: stub([]) }),
      await geocodeBlock('350 Road', { fetchImpl: stub([hit('143', 'OTHER', 1, 103)]) }),
      await geocodeBlock('999 Nowhere', { fetchImpl: stub([]) }),
    ];
    cases.forEach(c => {
      expect(c.matched).toBe(false);
      expect(typeof c.reason).toBe('string');
      expect(c.reason.length).toBeGreaterThan(0);
      expect(c.lat).toBeUndefined();
      expect(c.lng).toBeUndefined();
    });
  });
});
