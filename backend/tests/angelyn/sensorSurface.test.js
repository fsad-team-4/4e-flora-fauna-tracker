process.env.DATABASE_URL = 'sqlite::memory:';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const { computeSensorSurface, latestPerSensor, INFLUENCE_RADIUS_KM } = require('../../src/services/sensorSurface');

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
    expect(s.cells).toEqual([]);
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
    // IDW never overshoots its inputs, so with a single sensor every cell is 5
    expect(s.cells.length).toBeGreaterThan(0);
    expect([...new Set(s.cells.map(c => c.value))]).toEqual([5]);
    expect(s.scaleMax).toBe(5);
  });

  test('never overshoots the observed range - the surface cannot invent an intensity', () => {
    const s = computeSensorSurface({ readings: FIXTURES, asOf: new Date(NOW), gridResolution: 20 });
    const values = s.cells.map(c => c.value);
    expect(Math.min(...values)).toBeGreaterThanOrEqual(1); // quietest sensor
    expect(Math.max(...values)).toBeLessThanOrEqual(9);    // loudest sensor
  });

  test('is monotonic between two sensors - closer to the hot one reads hotter', () => {
    const s = computeSensorSurface({ readings: FIXTURES, asOf: new Date(NOW), gridResolution: 24 });
    const hot = { lat: 1.3678, lng: 103.8466 };
    const near = s.cells.reduce((best, c) => {
      const d = Math.hypot((c.south + c.north) / 2 - hot.lat, (c.west + c.east) / 2 - hot.lng);
      return !best || d < best.d ? { c, d } : best;
    }, null).c;
    const far = s.cells.reduce((best, c) => {
      const d = Math.hypot((c.south + c.north) / 2 - hot.lat, (c.west + c.east) / 2 - hot.lng);
      return !best || d > best.d ? { c, d } : best;
    }, null).c;
    expect(near.value).toBeGreaterThan(far.value);
  });

  test('NO DATA is absent, not zero - a cell beyond every sensor is never emitted', () => {
    // one sensor, and a grid padded well past its influence radius
    const one = [{ sensor_id: 'A', lat: 1.3678, lng: 103.8466, location_type: 'bin_centre', town_council: 'Ang Mo Kio Town Council', activity_level: 4, recorded_at: at(1), is_simulated: true }];
    const s = computeSensorSurface({ readings: one, asOf: new Date(NOW), gridResolution: 40 });
    // every emitted cell must have had a contributing sensor; none may be a
    // silent zero standing in for "we did not measure here"
    expect(s.cells.every(c => c.sensors > 0)).toBe(true);
    expect(s.cells.some(c => c.value === 0)).toBe(false);
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
