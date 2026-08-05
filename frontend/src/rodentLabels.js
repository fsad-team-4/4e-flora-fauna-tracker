/**
 * Display labels for rodent-assessment vocabulary.
 *
 * WHY THIS EXISTS, and it is not the reason it first looks like. The panel was rendering
 * `bin_overflow` and `gnaw_marks` straight to the operator, which reads as a missing
 * formatter - but those two fields are not supposed to contain tokens at all:
 *
 *   likely_cause      the AI's FREE-TEXT sentence (services/rodentService.js: "one sentence
 *                     explaining the most probable cause")
 *   signs_identified  already-normalised HUMAN labels ("Rodent droppings", "Gnaw marks" -
 *                     the prompt explicitly forbids echoing raw wording back)
 *   root_cause        the officer-set ENUM (ROOT_CAUSES) - the only one that is a token
 *
 * The snake_case on screen came from test fixtures writing enum keys into the two prose
 * fields. That is fixed at the source, in backend/src/testData.js.
 *
 * This module is still worth having as the DISPLAY layer, because a token must never reach
 * an operator whatever put it there - a fixture, a migration, an older row, or root_cause
 * doing its job. Belt and braces, with the belt being the data.
 *
 * THE CRITICAL RULE: `humanise` only rewrites strings that LOOK like tokens. Title-casing
 * everything would mangle the prose these fields are meant to hold - "Active burrows behind
 * the bin centre, droppings across the surround." would come back as one long Capitalised
 * Fragment. So any value containing spaces or an uppercase letter is returned untouched, and
 * only lowercase-and-underscores input is expanded.
 */

// The officer-set taxonomy (backend/src/models/RodentAssessment.js ROOT_CAUSES). Spelled out
// rather than derived, because mechanical expansion does not always read well: `unknown`
// becomes "Not determined", since "Unknown" beside a filled-in form field reads as an error
// rather than as a deliberate classification.
export const ROOT_CAUSE_LABELS = {
  bin_overflow: 'Bin overflow',
  food_waste: 'Food waste',
  structural_gap: 'Structural gap',
  external_food_source: 'External food source',
  vegetation: 'Vegetation cover',
  drain_ingress: 'Drain ingress',
  unknown: 'Not determined',
};

// Signs the AI is asked to emit as labels already; listed for the cases where a token form
// turns up anyway. Keys are the token spellings actually seen in stored data.
export const SIGN_LABELS = {
  droppings: 'Rodent droppings',
  gnaw_marks: 'Gnaw marks',
  burrows: 'Burrow or nest',
  runways: 'Runways',
  live_sighting: 'Live sighting',
  smear_marks: 'Grease marks',
  urine_odour: 'Urine odour',
  food_source: 'Food source exposed',
  structural_gap: 'Structural gap',
};

/** True when a value is a bare snake_case/lowercase token rather than prose. */
const isToken = v => typeof v === 'string' && v.length > 0 && /^[a-z0-9]+(_[a-z0-9]+)*$/.test(v);

/**
 * Token -> readable label. Prose passes through unchanged.
 *
 * `dict` is consulted first so a curated label beats mechanical expansion; an unknown token
 * still gets its underscores replaced and its first letter capitalised, which is always
 * better than showing the raw key.
 */
export function humanise(value, dict = null) {
  if (value == null) return value;
  const s = String(value);
  if (!isToken(s)) return s;
  if (dict && dict[s]) return dict[s];
  const spaced = s.replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export const rootCauseLabel = v => humanise(v, ROOT_CAUSE_LABELS);
export const signLabel = v => humanise(v, SIGN_LABELS);
/** `likely_cause` is prose by contract, so this only catches fixture/legacy token values. */
export const causeLabel = v => humanise(v, ROOT_CAUSE_LABELS);
