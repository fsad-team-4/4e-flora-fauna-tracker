// Tests for the feeding-sightings layer of the rodent risk map (Member 4 / Angelyn).
// Pure-function tests (no database, no HTTP - fast and deterministic). The feeding
// overlay must be as honest about its own coverage as the rodent layer: feeding
// sightings without a coordinate are COUNTED but NEVER placed, positions are never
// invented, and only feeding-tagged sightings appear on the layer.
//
// Field names match the real FaunaSighting: `block_number`, `floor_level`,
// `species`, `behaviour_tags` (a JSON array), `gps_lat`, `gps_lng`, `createdAt`.

const { computeFeedingPoints, FEEDING_TAG } = require('../../src/services/feedingPoints');

const NOW = new Date('2026-07-23T00:00:00Z').getTime();
const DAY = 24 * 60 * 60 * 1000;
const daysAgo = n => new Date(NOW - n * DAY).toISOString();

function run(sightings, opts = {}) {
  return computeFeedingPoints({ sightings, now: NOW, ...opts });
}

// clustered coordinates around one estate (~tens of metres apart)
const C1 = { gps_lat: 1.36786, gps_lng: 103.84652 };
const C2 = { gps_lat: 1.36773, gps_lng: 103.84668 };

// a feeding-tagged sighting factory (override any field per test)
const feed = (over = {}) => ({ species: 'cat', block_number: '128', behaviour_tags: [FEEDING_TAG], createdAt: daysAgo(2), ...over });

describe('only feeding-tagged sightings appear on this layer', () => {
  test('a non-feeding sighting is ignored entirely (not counted, not placed)', () => {
    const r = run([
      feed({ ...C1 }),
      { species: 'cat', block_number: '128', behaviour_tags: ['roosting'], ...C2, createdAt: daysAgo(2) },
    ]);
    expect(r.total).toBe(1);
    expect(r.points).toHaveLength(1);
  });

  test('a sighting with no behaviour_tags array is ignored (the map reads real array-shaped tags)', () => {
    const r = run([{ species: 'cat', block_number: '128', ...C1, createdAt: daysAgo(2) }]);
    expect(r.total).toBe(0);
    expect(r.points).toEqual([]);
  });
});

describe('coverage counts (the layer is honest about itself)', () => {
  test('total = mapped + unmapped, within the window', () => {
    const r = run([
      feed({ ...C1 }),
      feed({ block_number: '128' }),           // no coords
      feed({ gps_lat: null, gps_lng: null }),  // explicit null (the real-DB shape)
    ]);
    expect(r.total).toBe(3);
    expect(r.mappedCount).toBe(1);
    expect(r.unmappedCount).toBe(2);
    expect(r.mappedCount + r.unmappedCount).toBe(r.total);
  });

  test('empty input returns zero coverage and no points', () => {
    expect(run([])).toMatchObject({ total: 0, mappedCount: 0, unmappedCount: 0, points: [] });
  });
});

describe('never invents a position', () => {
  test('feeding without coordinates is unmapped, never placed', () => {
    const r = run([feed({ block_number: '128' })]);
    expect(r.points).toEqual([]);
    expect(r.unmappedCount).toBe(1);
  });

  test('explicit null coordinates are unmapped, never placed at (0,0)', () => {
    const r = run([feed({ gps_lat: null, gps_lng: null })]);
    expect(r.points).toEqual([]);
    expect(r.mappedCount).toBe(0);
    expect(r.unmappedCount).toBe(1);
  });

  test('a partial coordinate (lng only) is treated as no position', () => {
    const r = run([feed({ gps_lat: undefined, gps_lng: 103.8465 })]);
    expect(r.points).toEqual([]);
    expect(r.unmappedCount).toBe(1);
  });

  test('out-of-range coordinates are rejected, not clamped to an edge', () => {
    const r = run([feed({ gps_lat: 999, gps_lng: 999 })]);
    expect(r.points).toEqual([]);
    expect(r.unmappedCount).toBe(1);
  });

  test('a mapped point sits at the EXACT reported coordinate', () => {
    const p = run([feed({ ...C1 })]).points[0];
    expect(p.lat).toBe(C1.gps_lat);
    expect(p.lng).toBe(C1.gps_lng);
  });
});

describe('aggregation without moving points', () => {
  test('sightings at the SAME exact coordinate collapse to one point, with a species breakdown', () => {
    const r = run([
      feed({ ...C1, species: 'cat' }),
      feed({ ...C1, species: 'pigeon' }),
    ]);
    expect(r.points).toHaveLength(1);
    expect(r.points[0].count).toBe(2);
    expect(r.points[0].species).toEqual({ cat: 1, pigeon: 1 });
  });

  test('sightings at DISTINCT coordinates stay separate points', () => {
    expect(run([feed({ ...C1 }), feed({ ...C2 })]).points).toHaveLength(2);
  });
});

describe('point shape and ordering', () => {
  test('a point carries the sightings behind it (for click-through), latest first', () => {
    const p = run([
      feed({ id: 1, ...C1, createdAt: daysAgo(9) }),
      feed({ id: 2, ...C1, createdAt: daysAgo(2) }),
    ]).points[0];
    expect(p.sightings.map(s => s.id)).toEqual([2, 1]);
  });

  test('busiest points sort first', () => {
    const r = run([feed({ ...C1 }), feed({ ...C2 }), feed({ ...C2 })]);
    expect(r.points[0].count).toBe(2); // the C2 cluster
    expect(r.points[1].count).toBe(1);
  });
});

describe('window filtering', () => {
  test('excludes sightings older than windowDays (from both counts and points)', () => {
    const r = run([
      feed({ ...C1, createdAt: daysAgo(5) }),
      feed({ ...C2, createdAt: daysAgo(40) }),
    ]);
    expect(r.total).toBe(1);
    expect(r.points).toHaveLength(1);
  });
});
