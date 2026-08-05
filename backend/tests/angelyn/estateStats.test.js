// Unit tests for the estate statistics service (Member 4 / Angelyn).
// Pure-function tests: no database, no HTTP, so they're fast and deterministic.
// They verify the "sensemaking" logic behind the dashboard KPIs - hotspot
// detection, metric aggregation, and the explainable risk score.
//
// Field names match the real domain data: sightings/flora use `block_number`,
// flora health uses `at_risk` (underscore), matching mockDataService.

const {
  computeHotspots,
  computeEstateMetrics,
  computeRiskScore,
  riskStatus,
} = require('../../src/services/estateStats');

const flora = [
  { species: 'Bougainvillea', block_number: 'Block 123', health_status: 'critical' },
  { species: 'Heliconia', block_number: 'Block 890', health_status: 'critical' },
  { species: 'Frangipani', block_number: 'Block 456', health_status: 'at_risk' },
  { species: 'Hibiscus', block_number: 'Block 789', health_status: 'healthy' },
];

const sightings = [
  { species: 'cat', block_number: 'Block 123', createdAt: '2026-07-01T10:00:00Z' },
  { species: 'cat', block_number: 'Block 123', createdAt: '2026-07-02T10:00:00Z' },
  { species: 'cat', block_number: 'Block 123', createdAt: '2026-07-03T10:00:00Z' },
  { species: 'pigeon', block_number: 'Block 456', createdAt: '2026-07-01T10:00:00Z' },
  { species: 'pigeon', block_number: 'Block 456', createdAt: '2026-07-02T10:00:00Z' },
];

const cases = [
  { category: 'community_cat', status: 'open' },
  { category: 'flora_health', status: 'open' },
  { category: 'pest', status: 'resolved' },
  { category: 'pigeon', status: 'in_progress' },
];

describe('computeHotspots', () => {
  test('flags a block with 3+ sightings as a hotspot', () => {
    const hotspots = computeHotspots(sightings);
    const block123 = hotspots.find(h => h.block_number === 'Block 123');
    expect(block123).toBeDefined();
    expect(block123.count).toBe(3);
  });

  test('does NOT flag a block with fewer than 3 sightings', () => {
    const hotspots = computeHotspots(sightings);
    const block456 = hotspots.find(h => h.block_number === 'Block 456');
    expect(block456).toBeUndefined();
  });

  test('respects a custom minCount threshold', () => {
    const hotspots = computeHotspots(sightings, 2);
    expect(hotspots.find(h => h.block_number === 'Block 456')).toBeDefined();
  });

  test('returns an empty array when there are no sightings', () => {
    expect(computeHotspots([])).toEqual([]);
  });

  test('hotspot objects use block_number, not an undefined key (regression guard)', () => {
    const hotspots = computeHotspots(sightings);
    expect(hotspots[0]).toHaveProperty('block_number');
    expect(hotspots[0].block_number).toBeDefined();
  });

  test('collects the distinct animal types seen at a hotspot', () => {
    const hotspots = computeHotspots(sightings);
    const block123 = hotspots.find(h => h.block_number === 'Block 123');
    expect(block123.animals).toContain('cat');
  });

  test('sorts hotspots worst-first (highest count first)', () => {
    const s = [
      { species: 'cat', block_number: 'Block A' },
      { species: 'cat', block_number: 'Block A' },
      { species: 'cat', block_number: 'Block A' },
      { species: 'rat', block_number: 'Block B' },
      { species: 'rat', block_number: 'Block B' },
      { species: 'rat', block_number: 'Block B' },
      { species: 'rat', block_number: 'Block B' },
      { species: 'rat', block_number: 'Block B' },
    ];
    const hotspots = computeHotspots(s);
    expect(hotspots[0].block_number).toBe('Block B');
  });
});

describe('computeEstateMetrics', () => {
  const metrics = computeEstateMetrics({ flora, sightings, cases });

  test('counts critical flora correctly', () => {
    expect(metrics.criticalFlora).toBe(2);
  });

  test('counts at_risk flora correctly', () => {
    expect(metrics.atRiskFlora).toBe(1);
  });

  test('counts open cases correctly', () => {
    expect(metrics.openCases).toBe(2);
  });

  test('counts total sightings correctly', () => {
    expect(metrics.totalSightings).toBe(5);
  });

  test('reports the number of active hotspots', () => {
    expect(metrics.activeHotspots).toBe(1);
  });

  test('breaks cases down by status', () => {
    expect(metrics.casesByStatus).toMatchObject({ open: 2, in_progress: 1, resolved: 1 });
  });

  test('breaks cases down by category', () => {
    const cat = metrics.casesByCategory.find(c => c.category === 'community_cat');
    expect(cat.count).toBe(1);
  });

  test('ranks sightings by block using block_number', () => {
    const top = metrics.sightingsByBlock[0];
    expect(top).toHaveProperty('block_number');
    expect(top.block_number).toBe('Block 123');
  });

  test('includes a numeric risk score in 0-100', () => {
    expect(typeof metrics.riskScore).toBe('number');
    expect(metrics.riskScore).toBeGreaterThanOrEqual(0);
    expect(metrics.riskScore).toBeLessThanOrEqual(100);
  });

  test('includes a risk status string', () => {
    expect(['healthy', 'watch', 'critical']).toContain(metrics.riskStatus);
  });
});

/**
 * The score is a weighted SHARE, so every case here supplies denominators.
 *
 * It used to be a sum of absolute counts clipped at 100, which measured how much
 * data an estate had rather than how healthy it was. Against the real tables it
 * pinned at 100/100 "critical" permanently and flatlined the trend line on the
 * ceiling. Two tests below changed with that contract, deliberately:
 *   - "capped at 100" tested the clipping. The score is now bounded by
 *     construction, so the equivalent assertion is that a maximally bad estate
 *     reaches exactly 100 without any clamp.
 *   - the critical-vs-at-risk weighting test needed a totalFlora denominator; with
 *     none, both readings are correctly 0.
 */
describe('computeRiskScore', () => {
  const est = over => computeRiskScore({
    criticalFlora: 0, atRiskFlora: 0, openCases: 0, activeHotspots: 0,
    totalFlora: 20, totalCases: 10, ...over,
  });

  test('a troubled estate scores higher than a healthy one', () => {
    expect(est({ criticalFlora: 5, activeHotspots: 4, openCases: 8, atRiskFlora: 3 }))
      .toBeGreaterThan(est({}));
  });

  test('a perfectly healthy estate scores 0', () => {
    expect(est({})).toBe(0);
  });

  test('a maximally bad estate reaches exactly 100 - bounded, not clipped', () => {
    expect(est({
      criticalFlora: 20, atRiskFlora: 0, openCases: 10, activeHotspots: 5,
      totalFlora: 20, totalCases: 10,
    })).toBe(100);
  });

  test('the score never exceeds 100 even past every saturation point', () => {
    expect(est({
      criticalFlora: 20, atRiskFlora: 20, openCases: 10, activeHotspots: 99,
      totalFlora: 20, totalCases: 10,
    })).toBeLessThanOrEqual(100);
  });

  test('weights critical flora more heavily than at-risk flora', () => {
    expect(est({ criticalFlora: 1 })).toBeGreaterThan(est({ atRiskFlora: 1 }));
  });

  /**
   * THE REGRESSION GUARD - this is the bug that forced the rewrite.
   *
   * Under the old count-based formula these two estates scored identically,
   * because only the problem count fed the score. But 5 critical plants out of 200
   * is a far healthier estate than 5 out of 10, and a manager reading the hero card
   * must be able to tell them apart.
   */
  test('the same problem count scores lower on a larger, healthier estate', () => {
    const small = est({ criticalFlora: 5, totalFlora: 10 });
    const large = est({ criticalFlora: 5, totalFlora: 200 });
    expect(large).toBeLessThan(small);
  });

  test('adding healthy plants improves the score - impossible before', () => {
    const before = est({ criticalFlora: 3, totalFlora: 10 });
    const after = est({ criticalFlora: 3, totalFlora: 40 });
    expect(after).toBeLessThan(before);
  });

  test('resolving cases improves the score', () => {
    expect(est({ openCases: 2, totalCases: 10 }))
      .toBeLessThan(est({ openCases: 8, totalCases: 10 }));
  });

  test('hotspot pressure saturates rather than dominating', () => {
    // Past the saturation point extra hotspots cannot push the total up further,
    // so hotspots alone can never account for more than their weight.
    expect(est({ activeHotspots: 5 })).toBe(est({ activeHotspots: 50 }));
  });

  test('missing denominators do not produce NaN', () => {
    const score = computeRiskScore({ criticalFlora: 3, atRiskFlora: 1, openCases: 2, activeHotspots: 1 });
    expect(Number.isFinite(score)).toBe(true);
  });
});

describe('riskStatus', () => {
  test('scores >= 60 are critical', () => {
    expect(riskStatus(60)).toBe('critical');
    expect(riskStatus(85)).toBe('critical');
  });

  test('scores 25-59 are watch', () => {
    expect(riskStatus(25)).toBe('watch');
    expect(riskStatus(59)).toBe('watch');
  });

  test('scores below 25 are healthy', () => {
    expect(riskStatus(0)).toBe('healthy');
    expect(riskStatus(24)).toBe('healthy');
  });
});