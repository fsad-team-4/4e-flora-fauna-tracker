process.env.DATABASE_URL = 'sqlite::memory:';
process.env.JWT_SECRET = 'test-secret';

const { computeSensorSurface, latestPerSensor, INFLUENCE_RADIUS_KM } = require('../../src/services/sensorSurface');

// The surface is a DENSE grid now (null = no sensor in range), because the
// renderer runs marching squares over it. These read the covered values out.
const covered = s => (s.grid?.values || []).filter(v => v !== null);

// Fixed clock so the window and "as of" behaviour are deterministic.
const NOW = new Date('2026-07-30T12:00:00.000Z').getTime();
const at = daysAgo => new Date(NOW - daysAgo * 86400000).toISOString();

// Two sensors ~200m apart in Ang Mo Kio, one hot one quiet, each reporting twice.
const FIXTURES = [
  { sensor_id: 'A', lat: 1.3678, lng: 103.8466, location_type: 'refuse_chute', town_council: 'Ang Mo Kio Town Council', activity_level: 2, recorded_at: at(10), is_simulated: true },
  { sensor_id: 'A', lat: 1.3678, lng: 103.8466, location_type: 'refuse_chute', town_council: 'Ang Mo Kio Town Council', activity_level: 9, recorded_at: at(1), is_simulated: true },
  { sensor_id: 'B', lat: 1.3696, lng: 103.8461, location_type: 'void_deck', town_council: 'Ang Mo Kio Town Council', activity_level: 1, recorded_at: at(2), is_simulated: true },
];

describe('computeSensorSurface - purity and envelope', () => {
  test('is a pure function of its inputs (same fixtures + asOf -> identical output)', () => {
    const a = computeSensorSurface({ readings: FIXTURES, asOf: new Date(NOW), gridResolution: 12 });
    const b = computeSensorSurface({ readings: FIXTURES, asOf: new Date(NOW), gridResolution: 12 });
    expect(a).toEqual(b);
  });

  test('always declares itself simulated, whatever the input', () => {
    const s = computeSensorSurface({ readings: FIXTURES, asOf: new Date(NOW) });
    expect(s.is_simulated).toBe(true);
    expect(s.source).toMatch(/simulated/i);
    // council grouping is a circle model, so it must announce that
    expect(s.boundaries_approximate).toBe(true);
  });

  test('an empty input still declares itself simulated and claims nothing', () => {
    const s = computeSensorSurface({ readings: [], asOf: new Date(NOW) });
    expect(s.is_simulated).toBe(true);
    expect(s.sensorCount).toBe(0);
    expect(s.grid).toBeNull();
    expect(s.coveredCells).toBe(0);
    expect(s.scaleMax).toBe(0);
    expect(s.bounds).toBeNull();
  });
});

describe('latestPerSensor - a sensor is a device, not a reading', () => {
  test('collapses many readings to one current value per sensor', () => {
    const sensors = latestPerSensor(FIXTURES, NOW);
    expect(sensors).toHaveLength(2);
    // sensor A reported 2 ten days ago and 9 yesterday - the surface uses 9
    expect(sensors.find(s => s.sensor_id === 'A').activity_level).toBe(9);
  });

  test('ignores readings after the asOf moment, so the scrubber cannot see the future', () => {
    const sensors = latestPerSensor(FIXTURES, NOW - 5 * 86400000);
    expect(sensors.find(s => s.sensor_id === 'A').activity_level).toBe(2); // the 9 is later
  });

  test('drops readings positioned outside Singapore rather than plotting them', () => {
    const rogue = [...FIXTURES, {
      sensor_id: 'X', lat: 51.5, lng: -0.12, location_type: 'void_deck',
      town_council: 'Nowhere', activity_level: 99, recorded_at: at(1), is_simulated: true,
    }];
    expect(latestPerSensor(rogue, NOW).map(s => s.sensor_id).sort()).toEqual(['A', 'B']);
  });
});

describe('interpolation behaviour', () => {
  test('a cell on top of a sensor takes that sensor value', () => {
    const one = [{ sensor_id: 'A', lat: 1.3678, lng: 103.8466, location_type: 'bin_centre', town_council: 'Ang Mo Kio Town Council', activity_level: 5, recorded_at: at(1), is_simulated: true }];
    const s = computeSensorSurface({ readings: one, asOf: new Date(NOW), gridResolution: 9 });
    // IDW never overshoots its inputs, so with a single sensor every covered
    // cell is 5 - and the grid is square and fully described
    expect(s.coveredCells).toBeGreaterThan(0);
    expect(s.grid.values).toHaveLength(s.grid.width * s.grid.height);
    expect([...new Set(covered(s))]).toEqual([5]);
    expect(s.scaleMax).toBe(5);
  });

  test('never overshoots the observed range - the surface cannot invent an intensity', () => {
    const s = computeSensorSurface({ readings: FIXTURES, asOf: new Date(NOW), gridResolution: 20 });
    const values = covered(s);
    expect(Math.min(...values)).toBeGreaterThanOrEqual(1); // quietest sensor
    expect(Math.max(...values)).toBeLessThanOrEqual(9);    // loudest sensor
  });

  test('is monotonic between two sensors - closer to the hot one reads hotter', () => {
    const s = computeSensorSurface({ readings: FIXTURES, asOf: new Date(NOW), gridResolution: 24 });
    const hot = { lat: 1.3678, lng: 103.8466 };
    const { width, dLat, dLng, values } = s.grid;
    let near = null;
    let far = null;
    values.forEach((v, idx) => {
      if (v === null) return;
      const cLat = s.bounds.south + (Math.floor(idx / width) + 0.5) * dLat;
      const cLng = s.bounds.west + ((idx % width) + 0.5) * dLng;
      const d = Math.hypot(cLat - hot.lat, cLng - hot.lng);
      if (!near || d < near.d) near = { v, d };
      if (!far || d > far.d) far = { v, d };
    });
    expect(near.v).toBeGreaterThan(far.v);
  });

  test('NO DATA is absent, not zero - ground beyond every sensor stays null', () => {
    // Two sensors ~10km apart (Ang Mo Kio and Sembawang), so the grid spans far
    // more ground than the 1.2km influence radius can cover and the middle is
    // genuinely unmeasured. A single sensor would not exercise this: the padded
    // bounding box is smaller than the radius, so every cell is covered.
    const far = [
      { sensor_id: 'A', lat: 1.3678, lng: 103.8466, location_type: 'bin_centre', town_council: 'Ang Mo Kio Town Council', activity_level: 4, recorded_at: at(1), is_simulated: true },
      { sensor_id: 'C', lat: 1.4486, lng: 103.8182, location_type: 'bin_centre', town_council: 'Sembawang Town Council', activity_level: 6, recorded_at: at(1), is_simulated: true },
    ];
    const s = computeSensorSurface({ readings: far, asOf: new Date(NOW), gridResolution: 40 });
    // uncovered ground is null - never 0, which would read as "measured, quiet"
    // and would let the renderer band across it
    expect(s.grid.values.some(v => v === null)).toBe(true);
    expect(covered(s).some(v => v === 0)).toBe(false);
    expect(s.coveredCells).toBeLessThan(s.grid.values.length);
    // and the influence radius is genuinely finite
    expect(INFLUENCE_RADIUS_KM).toBeGreaterThan(0);
  });

  test('council filter narrows the contributing sensors', () => {
    const mixed = [...FIXTURES, {
      sensor_id: 'C', lat: 1.4486, lng: 103.8182, location_type: 'bin_centre',
      town_council: 'Sembawang Town Council', activity_level: 7, recorded_at: at(1), is_simulated: true,
    }];
    const all = computeSensorSurface({ readings: mixed, asOf: new Date(NOW) });
    expect(all.sensorCount).toBe(3);
    const amk = computeSensorSurface({ readings: mixed, asOf: new Date(NOW), councils: ['Ang Mo Kio Town Council'] });
    expect(amk.sensorCount).toBe(2);
    expect(amk.councils).toEqual(['Ang Mo Kio Town Council']);
  });
});
