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
  { animal_type: 'cat', block_number: 'Block 123', date: '2026-07-01T10:00:00Z' },
  { animal_type: 'cat', block_number: 'Block 123', date: '2026-07-02T10:00:00Z' },
  { animal_type: 'cat', block_number: 'Block 123', date: '2026-07-03T10:00:00Z' },
  { animal_type: 'pigeon', block_number: 'Block 456', date: '2026-07-01T10:00:00Z' },
  { animal_type: 'pigeon', block_number: 'Block 456', date: '2026-07-02T10:00:00Z' },
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
      { animal_type: 'cat', block_number: 'Block A' },
      { animal_type: 'cat', block_number: 'Block A' },
      { animal_type: 'cat', block_number: 'Block A' },
      { animal_type: 'rat', block_number: 'Block B' },
      { animal_type: 'rat', block_number: 'Block B' },
      { animal_type: 'rat', block_number: 'Block B' },
      { animal_type: 'rat', block_number: 'Block B' },
      { animal_type: 'rat', block_number: 'Block B' },
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

describe('computeRiskScore', () => {
  test('a troubled estate scores higher than a healthy one', () => {
    const healthy = computeRiskScore({ criticalFlora: 0, activeHotspots: 0, openCases: 0, atRiskFlora: 0 });
    const troubled = computeRiskScore({ criticalFlora: 5, activeHotspots: 4, openCases: 10, atRiskFlora: 3 });
    expect(troubled).toBeGreaterThan(healthy);
  });

  test('is capped at 100 for extreme input', () => {
    const extreme = computeRiskScore({ criticalFlora: 100, activeHotspots: 100, openCases: 100, atRiskFlora: 100 });
    expect(extreme).toBe(100);
  });

  test('a perfectly healthy estate scores 0', () => {
    expect(computeRiskScore({ criticalFlora: 0, activeHotspots: 0, openCases: 0, atRiskFlora: 0 })).toBe(0);
  });

  test('weights critical flora more heavily than at-risk flora', () => {
    const oneCritical = computeRiskScore({ criticalFlora: 1, activeHotspots: 0, openCases: 0, atRiskFlora: 0 });
    const oneAtRisk = computeRiskScore({ criticalFlora: 0, activeHotspots: 0, openCases: 0, atRiskFlora: 1 });
    expect(oneCritical).toBeGreaterThan(oneAtRisk);
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