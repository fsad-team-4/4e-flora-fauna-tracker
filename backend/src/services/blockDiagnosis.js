// angelyn
// Behavioural Diagnosis (RISE framework): the cross-domain layer that explains
// WHY a hotspot recurs, not just that it does. This module is the only place
// fauna and rodent data meet, so it is the only place this pattern is visible.
//
// The hypothesis: deliberate feeding leaves food waste, and food waste is a
// rodent food source. A block with BOTH feeding-tagged sightings AND recurring
// rodent risk is worth investigating for food waste as a root cause, rather
// than treating each rodent report as an isolated pest call-out.
//
// HONESTY (these constraints shape the return value):
//   - This is CO-OCCURRENCE, not proven causation. The function returns raw
//     counts, never a synthesised confidence number - the evidence is the counts.
//   - It returns sampleSize so the caller can state plainly how little (or much)
//     data a block's signal rests on; single-digit sizes are not significant.
//   - It returns firstFeedingDate and firstRodentDate so the caller can check
//     ordering. If feeding was first logged AFTER the rodent reports, it cannot
//     be presented as a driver.

// The behaviour tag that marks a food source. Named constant because the real
// tag vocabulary (faunaController BEHAVIOUR_TAGS) may change - this is the single
// line to update if "feeding" is ever renamed or split.
const FEEDING_TAG = 'feeding';

// Rodent risk levels that count as "elevated" - the actionable end of the scale.
const ELEVATED_LEVELS = ['medium', 'high', 'critical'];

const DAY_MS = 24 * 60 * 60 * 1000;

// Normalise a free-text block string for matching. This is the ONLY place fauna
// and rodent block labels are joined, and the two modules write different formats:
// fauna writes bare numbers ("128") while rodent writes "Block 128". So beyond
// trim + lowercase we also strip a leading "block" prefix - otherwise "128" and
// "block 128" fall into different buckets and a real co-occurrence is missed
// (they were, until this was fixed). Returns '' if unusable.
//
// "BLK" TOO, not just "BLOCK". The live data carries both spellings in the same
// column - "Block 128" alongside "Blk 165 Bishan St 13" - and stripping only the long
// form left the abbreviated ones keyed on their own prefix, so the same block written
// two ways never matched. The optional dot covers "Blk." as well.
//
// It is deliberately a PREFIX strip and nothing more. A premises name has to survive
// intact: "Sunshine Mall" must key as itself, because rodent reports are not all at
// residential blocks and a normaliser that mangles a mall's name to chase block
// numbers would silently merge unrelated locations.
//
// KNOWN LIMIT, not a bug to be regexed away: "blk 123" and "blk 123 ang mo kio ave 3"
// are almost certainly the same block, and nothing in the strings proves it. Resolving
// that needs a postal code or coordinate proximity, so the two stay separate rather
// than being guessed into one.
function blockKey(block) {
  // The lookahead is load-bearing: the prefix is only stripped when a NUMBER follows,
  // which is what a block label is. Without it the strip ate the front of any word
  // beginning with "block" - "Blockbuster Cafe" keyed as "buster cafe", quietly
  // inventing a location. Requiring digits also means "Blk123" with no space still
  // normalises, while a premises name never can.
  return (block || '').trim().toLowerCase().replace(/^(?:block|blk)\.?\s*(?=\d)/, '').trim();
}

// True if a sighting was tagged as feeding. This repo currently carries TWO
// fauna shapes: the real FaunaSighting.behaviour_tags (a JSON array) and the
// legacy mockDataService.behaviour (a single string). Assuming only one silently
// zeroes the feeding count for the other - the exact field-shape bug we avoid -
// so both are handled.
function hasFeeding(sighting) {
  const tags = sighting.behaviour_tags;
  if (Array.isArray(tags)) return tags.includes(FEEDING_TAG);
  if (typeof sighting.behaviour === 'string') return sighting.behaviour === FEEDING_TAG;
  return false;
}

// Parse a timestamp to epoch ms, or null if missing/invalid.
function toTime(value) {
  if (!value) return null;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? null : t;
}

// Group feeding sightings and rodent assessments by block, then rank the blocks
// where BOTH signals are present within the window.
//
// `now` is injectable (defaulting to Date.now()) purely so the window is testable
// with fixed fixtures - same pattern as computeScorecard. Callers in production
// omit it. Pure: no DB calls, no I/O.
function computeFeedingRodentCorrelation({
  sightings = [],
  assessments = [],
  windowDays = 30,
  now = Date.now(),
} = {}) {
  const since = now - windowDays * DAY_MS;
  const blocks = new Map();

  // Fetch-or-create the aggregate for a raw block string. Returns null for a
  // blank/unknown block - those cannot be correlated to a location.
  function bucketFor(rawBlock) {
    const key = blockKey(rawBlock);
    if (!key) return null;
    let b = blocks.get(key);
    if (!b) {
      b = {
        block_number: blockLabel(rawBlock), // canonical display label - see blockLabel
        feedingCount: 0,
        rodentAssessmentCount: 0,
        elevatedRodentCount: 0,
        firstFeedingTime: null,
        firstRodentTime: null,
      };
      blocks.set(key, b);
    }
    return b;
  }

  for (const s of sightings) {
    const t = toTime(s.createdAt);
    if (t === null || t < since) continue;
    if (!hasFeeding(s)) continue;
    const b = bucketFor(s.block_number);
    if (!b) continue;
    b.feedingCount += 1;
    if (b.firstFeedingTime === null || t < b.firstFeedingTime) b.firstFeedingTime = t;
  }

  for (const a of assessments) {
    const t = toTime(a.createdAt);
    if (t === null || t < since) continue;
    const b = bucketFor(a.block_number);
    if (!b) continue;
    b.rodentAssessmentCount += 1;
    if (ELEVATED_LEVELS.includes(a.risk_level)) b.elevatedRodentCount += 1;
    if (b.firstRodentTime === null || t < b.firstRodentTime) b.firstRodentTime = t;
  }

  return [...blocks.values()]
    // a co-occurrence needs BOTH signals present
    .filter(b => b.feedingCount > 0 && b.rodentAssessmentCount > 0)
    .map(b => ({
      block_number: b.block_number,
      feedingCount: b.feedingCount,
      rodentAssessmentCount: b.rodentAssessmentCount,
      elevatedRodentCount: b.elevatedRodentCount,
      firstFeedingDate: b.firstFeedingTime === null ? null : new Date(b.firstFeedingTime).toISOString(),
      firstRodentDate: b.firstRodentTime === null ? null : new Date(b.firstRodentTime).toISOString(),
      // how much data this block's signal rests on - stated plainly by the UI
      sampleSize: b.feedingCount + b.rodentAssessmentCount,
    }))
    // worst-first: elevated rodent risk, then feeding pressure, then evidence volume
    .sort((a, b) =>
      b.elevatedRodentCount - a.elevatedRodentCount ||
      b.feedingCount - a.feedingCount ||
      b.sampleSize - a.sampleSize
    );
}

/**
 * DISPLAY label for a block - blockKey's counterpart, and here for the same reason
 * blockKey is: three files had grown their own version, and two of them were wrong.
 *
 * blockKey answers "are these the same place" and must lowercase to do it. This answers
 * "what do we call it", so it must NOT - rebuilding a label from the key rendered
 * "Block b". The rule instead:
 *
 *  - a block/blk prefix followed by a NUMBER is normalised to one spelling, so the
 *    dashboard's tables cannot print "Block 123" and "123" for the same block;
 *  - a bare number gets the prefix;
 *  - anything else is a named place - a mall, a food centre, a bin centre - and is left
 *    exactly as the operator typed it.
 *
 * The digit lookahead is the same load-bearing detail as in blockKey: without it, the
 * strip ate part of real names and turned "Blockbuster Cafe" into "Block buster Cafe".
 */
function blockLabel(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return 'Unspecified block';
  const prefixed = s.match(/^(?:block|blk)\.?\s*(?=\d)(.*)$/i);
  if (prefixed) return `Block ${prefixed[1].trim()}`;
  if (/^\d/.test(s)) return `Block ${s}`;
  return s;
}

module.exports = { computeFeedingRodentCorrelation, blockKey, blockLabel, FEEDING_TAG, ELEVATED_LEVELS };
