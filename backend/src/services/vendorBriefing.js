// angelyn
// AI-drafted contractor briefing.
//
// DRAFT ONLY. This never sends anything and is never called on a dispatch path:
// an officer requests a draft, reads it, edits it, and only then chooses to
// send. Auto-dispatching AI text to a paid vendor is exactly the
// human-out-of-the-loop behaviour the brief forbids.
//
// Follows the geminiService pattern (same SDK, same withTimeout guard) rather
// than adding a second AI integration style to the codebase.
//
// TWO CALLERS, ONE GENERATOR:
//   - the Action Queue drafts for an existing work order
//   - the risk map drafts straight from a cluster's assessment ids, before any
//     work order exists
// so `context` is a plain object either caller can build, not a WorkOrder row.
const { GoogleGenAI } = require('@google/genai');
const { withTimeout } = require('../utils/withTimeout');

const ai = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  : null;

function hasApiKey() {
  return ai !== null;
}

/**
 * Model preference order, most-quota-headroom first.
 *
 * WHY THIS IS A LIST AND NOT A STRING: the whole team shares one API key, and on
 * the Gemini free tier the daily request cap is PER MODEL. gemini-3.5-flash caps
 * at 20 requests/day, and five call sites across the project were competing for
 * it - so briefings started failing with a 429 ("Quota exceeded for metric
 * generativelanguage.googleapis.com/generate_content_free_tier_requests,
 * limit: 20, model: gemini-3.5-flash") while everything else looked fine.
 *
 * gemini-2.5-flash carries a far larger daily allowance and is what
 * rodentService.js already uses successfully, so it leads. If it is exhausted or
 * unavailable the next model is tried, which means one drained bucket degrades
 * the feature instead of breaking it.
 *
 * Override with GEMINI_MODEL to pin a specific model without a code change.
 */
const MODEL_CHAIN = [
  ...(process.env.GEMINI_MODEL ? [process.env.GEMINI_MODEL] : []),
  'gemini-2.5-flash',
  'gemini-3.5-flash',
].filter((m, i, a) => a.indexOf(m) === i);

// Worth trying the next model for: quota exhaustion, upstream flakiness, and
// timeouts. A 400 means the request itself is wrong, so retrying is pointless.
function isRetryable(err) {
  const msg = String(err?.message || '');
  if (/timed out/i.test(msg)) return true;
  const code = msg.match(/"code"\s*:\s*(\d+)/);
  if (code) {
    const n = Number(code[1]);
    return n === 429 || n === 500 || n === 503 || n === 504;
  }
  return /RESOURCE_EXHAUSTED|UNAVAILABLE|quota/i.test(msg);
}

/**
 * Ask the models in order until one answers. Returns { text, model } or throws
 * the LAST error, so the caller's honesty contract (no text on failure) holds.
 */
async function generateWithFallback(prompt) {
  let lastErr = null;
  for (const model of MODEL_CHAIN) {
    try {
      const response = await withTimeout(
        ai.models.generateContent({ model, contents: prompt }),
        20000,
        `Gemini vendor briefing (${model})`,
      );
      const text = (response.text || '').trim();
      if (text) return { text, model };
      lastErr = new Error(`${model} returned an empty briefing`);
    } catch (e) {
      lastErr = e;
      if (!isRetryable(e)) break;          // a bad request will not fix itself
      console.error(`vendor briefing: ${model} unavailable, trying next -`, e.message.slice(0, 120));
    }
  }
  throw lastErr || new Error('no model produced a briefing');
}

const fmtDate = d => (d ? new Date(d).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' }) : 'unknown date');

/**
 * Factual fallback used ONLY when no API key is configured.
 *
 * Deliberately NOT used when a configured AI call fails - see draftBriefing.
 * It restates recorded facts and nothing else: no inferred cause, no severity
 * it was not given. Returned with `stubbed: true` so the UI labels it a
 * template rather than passing it off as an AI draft.
 */
function stubBriefing(ctx, assessments, feeding = null) {
  const lines = [
    `PEST CONTROL CALL-OUT - ${ctx.block_number || 'block not specified'}`,
    `Severity: ${ctx.risk_level || 'not recorded'} | Reports: ${assessments.length}`,
    ctx.town_council ? `Town council: ${ctx.town_council}` : null,
    '',
    'ACCESS',
    `Locations reported: ${[...new Set(assessments.map(a => a.floor_level).filter(Boolean))].join(', ') || 'not recorded'}`,
    '',
    'OBSERVED',
    ...assessments.map((a, i) => `${i + 1}. [${a.risk_level || 'unrated'}] ${fmtDate(a.createdAt)} - ${a.observations}`),
    '',
    'HISTORY',
    `${assessments.length} report${assessments.length === 1 ? '' : 's'} between ${fmtDate(assessments[assessments.length - 1]?.createdAt)} and ${fmtDate(assessments[0]?.createdAt)}.`,
    // co-occurrence, never causation
    feeding?.sightings
      ? `\nCO-OCCURRING FEEDING ACTIVITY\n${feeding.sightings} feeding sighting${feeding.sightings === 1 ? '' : 's'} recorded at this block in the same period. This is co-occurrence worth investigating, not an established cause.`
      : null,
    ctx.notes ? `\nOFFICER NOTES\n${ctx.notes}` : null,
  ];
  return lines.filter(l => l !== null).join('\n');
}

function buildPrompt(ctx, assessments, feeding) {
  const reports = assessments.map((a, i) => [
    `Report ${i + 1} (${fmtDate(a.createdAt)}, severity ${a.risk_level || 'unrated'}):`,
    `  Location detail: ${a.floor_level || 'not recorded'}`,
    `  Observed: ${a.observations}`,
    a.likely_cause ? `  Assessed cause: ${a.likely_cause}` : null,
  ].filter(Boolean).join('\n')).join('\n\n');

  const feedingBlock = feeding?.sightings
    ? `CO-OCCURRING FEEDING ACTIVITY AT THIS BLOCK
${feeding.sightings} feeding sighting(s) recorded in the same period${feeding.species ? ` (${feeding.species})` : ''}.
This is CO-OCCURRENCE ONLY. It has not been established as the cause.`
    : 'CO-OCCURRING FEEDING ACTIVITY AT THIS BLOCK\nNone recorded.';

  return `You are an estate operations officer writing a short work brief for an external pest control contractor attending a Singapore town council estate.

Write a briefing the technician can act on before arriving. Cover, in this order:
1. Site and access - block, and any floor/area detail that was recorded.
2. What was observed - synthesise the reports; do not list them one by one.
3. Severity and why it was escalated.
4. History - how many reports over what period, and whether this location repeats.
5. Co-occurring feeding activity, IF any is recorded below.

STRICT RULES:
- Use ONLY the facts below. Do not invent access codes, contact numbers, unit numbers, appointment times, prior contact history, or treatment methods that were not stated.
- If something is not recorded, write "not recorded" rather than guessing.
- Do not assert a severity beyond the one given.
- If feeding activity is mentioned, describe it as CO-OCCURRENCE WORTH INVESTIGATING. Never state or imply it caused the rodent activity.
- Do NOT state or imply an attendance date. Scheduling is handled separately by a human.
- Plain prose, under 200 words, no markdown headers, no bullet symbols.

SITE
Block: ${ctx.block_number || 'not specified'}
Town council: ${ctx.town_council || 'not recorded'}
Highest severity: ${ctx.risk_level || 'not recorded'}
Reports consolidated: ${assessments.length}
Officer notes: ${ctx.notes || 'none'}

REPORTS
${reports}

${feedingBlock}`;
}

/**
 * Draft a briefing.
 *
 * Returns one of three shapes, and the distinction is the honesty contract:
 *   { text, stubbed: false }  - a real AI draft
 *   { text, stubbed: true }   - NO API KEY configured, so this is a factual
 *                               template the UI must label as such
 *   { error, aiFailed: true } - the AI was configured but the call failed.
 *                               NO text is returned. The officer is told and
 *                               writes the briefing manually, because silently
 *                               substituting a template that reads like an AI
 *                               draft would misrepresent where the words came
 *                               from.
 */
async function draftBriefing(context = {}, assessments = [], feeding = null) {
  if (!assessments.length) {
    return { error: 'no assessments to brief on' };
  }
  if (!hasApiKey()) {
    return { text: stubBriefing(context, assessments, feeding), stubbed: true };
  }
  try {
    const { text, model } = await generateWithFallback(buildPrompt(context, assessments, feeding));
    return { text, stubbed: false, model };
  } catch (e) {
    console.error('vendor briefing generation failed on every model:', e.message);
    // Quota is the common case and the officer can act on it, so say so plainly
    // instead of surfacing a wall of Google JSON.
    const quota = /429|RESOURCE_EXHAUSTED|quota/i.test(String(e.message));
    return {
      error: quota
        ? 'the AI daily quota is used up, so no draft could be generated'
        : 'the AI service could not be reached, so no draft could be generated',
      aiFailed: true,
      quota_exhausted: quota,
    };
  }
}

module.exports = { draftBriefing, hasApiKey, stubBriefing, MODEL_CHAIN, isRetryable };
