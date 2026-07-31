// angelyn
// AI-drafted contractor briefing for a work order.
//
// DRAFT ONLY. This never sends anything and is never called on the dispatch
// path: an officer requests a draft, reads it, edits it, and only then chooses
// to dispatch. Auto-dispatching AI text to a paid vendor is exactly the
// human-out-of-the-loop behaviour the brief forbids.
//
// Follows the geminiService pattern (same SDK, same withTimeout guard, same
// graceful degradation when no API key is configured) rather than adding a
// second AI integration style to the codebase.
const { GoogleGenAI } = require('@google/genai');
const { withTimeout } = require('../utils/withTimeout');

const ai = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  : null;

function hasApiKey() {
  return ai !== null;
}

const fmtDate = d => (d ? new Date(d).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' }) : 'unknown date');

/**
 * Deterministic fallback used when no API key is configured.
 *
 * It restates recorded facts and nothing else - no inferred cause, no severity
 * it was not given. Marked `stubbed: true` so the caller can label it in the UI
 * instead of passing it off as an AI draft.
 */
function stubBriefing(wo, assessments) {
  const lines = [
    `PEST CONTROL CALL-OUT - ${wo.block_number || 'block not specified'}`,
    `Severity: ${wo.risk_level || 'not recorded'} | Consolidated reports: ${assessments.length}`,
    wo.town_council ? `Town council: ${wo.town_council}` : null,
    '',
    'ACCESS',
    `Locations reported: ${[...new Set(assessments.map(a => a.floor_level).filter(Boolean))].join(', ') || 'not recorded'}`,
    '',
    'OBSERVED',
    ...assessments.map((a, i) => `${i + 1}. [${a.risk_level || 'unrated'}] ${fmtDate(a.createdAt)} - ${a.observations}`),
    '',
    'HISTORY',
    `${assessments.length} report${assessments.length === 1 ? '' : 's'} between ${fmtDate(assessments[assessments.length - 1]?.createdAt)} and ${fmtDate(assessments[0]?.createdAt)}.`,
    wo.notes ? `\nOFFICER NOTES\n${wo.notes}` : null,
  ];
  return lines.filter(l => l !== null).join('\n');
}

function buildPrompt(wo, assessments) {
  const reports = assessments.map((a, i) => [
    `Report ${i + 1} (${fmtDate(a.createdAt)}, severity ${a.risk_level || 'unrated'}):`,
    `  Location detail: ${a.floor_level || 'not recorded'}`,
    `  Observed: ${a.observations}`,
    a.likely_cause ? `  Assessed cause: ${a.likely_cause}` : null,
  ].filter(Boolean).join('\n')).join('\n\n');

  return `You are an estate operations officer writing a short work brief for an external pest control contractor attending a Singapore town council estate.

Write a briefing the technician can act on before arriving. Cover, in this order:
1. Site and access - block, and any floor/area detail that was recorded.
2. What was observed - synthesise the reports; do not list them one by one.
3. Severity and why it was escalated.
4. History - how many reports over what period, and whether this location repeats.

STRICT RULES:
- Use ONLY the facts below. Do not invent access codes, contact numbers, appointment times, unit numbers, or treatment methods that were not stated.
- If something is not recorded, write "not recorded" rather than guessing.
- Do NOT state or imply an attendance date. Scheduling is handled separately by a human.
- Plain prose, under 200 words, no markdown headers, no bullet symbols.

WORK ORDER
Block: ${wo.block_number || 'not specified'}
Town council: ${wo.town_council || 'not recorded'}
Highest severity: ${wo.risk_level || 'not recorded'}
Consolidated reports: ${assessments.length}
Officer notes: ${wo.notes || 'none'}

REPORTS
${reports}`;
}

/**
 * Draft a briefing. Returns { text, stubbed } - `stubbed` true means the
 * deterministic fallback was used, which the UI must surface so nobody believes
 * a template was model-written.
 */
async function draftBriefing(workOrder, assessments = []) {
  if (!assessments.length) {
    return { text: null, stubbed: false, error: 'no consolidated assessments to brief on' };
  }
  if (!hasApiKey()) {
    return { text: stubBriefing(workOrder, assessments), stubbed: true };
  }
  try {
    const response = await withTimeout(
      ai.models.generateContent({ model: 'gemini-3.5-flash', contents: buildPrompt(workOrder, assessments) }),
      20000,
      'Gemini vendor briefing',
    );
    const text = (response.text || '').trim();
    if (!text) return { text: stubBriefing(workOrder, assessments), stubbed: true };
    return { text, stubbed: false };
  } catch (e) {
    console.error('vendor briefing generation failed, using factual fallback:', e.message);
    return { text: stubBriefing(workOrder, assessments), stubbed: true };
  }
}

module.exports = { draftBriefing, hasApiKey, stubBriefing };
