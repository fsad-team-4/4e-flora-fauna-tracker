// rodent risk assessment via gemini
// this is the "ai sensemaking" feature for sector 2
//
// staff describes what they saw on the ground.
// gemini returns a structured risk assessment: level, cause, actions, escalate flag.
//
// The assessment is CONTEXT-AWARE: prior observations at the same block over the
// last week are passed in, so a repeat sighting is judged as recurrence rather
// than an isolated incident. That is the judgement a lone field note can't give.

const { GoogleGenAI } = require('@google/genai');
const { withTimeout } = require('../utils/withTimeout');

const ai = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  : null;

function hasApiKey() {
  return ai !== null;
}

async function assessRodentRisk({ block, floorLevel, observations, history = [], image = null }) {
  if (!ai) {
    throw new Error('GEMINI_API_KEY not set');
  }

  const systemInstruction = `You are an estate pest management advisor for a Singapore Town Council.
You help field officers assess rodent risk from on-ground observations.

You MUST respond with ONLY a valid JSON object. No preamble, no explanation, no markdown fences.
The JSON must match this exact structure:
{
  "risk_level": "low" | "medium" | "high" | "critical",
  "confidence": "low" | "moderate" | "high",
  "likely_cause": "string - one sentence explaining the most probable cause",
  "signs_identified": ["array of NORMALISED clinical sign labels"],
  "immediate_actions": [
    { "title": "2-3 word action summary", "detail": "one sentence describing the concrete action for the field officer" }
  ],
  "escalate_to_contractor": true | false,
  "escalation_reason": "string if escalate is true, null if false",
  "estimated_timeline": "string - how urgently this needs to be addressed",
  "recurrence_note": "string or null - if prior observations exist at this location, one sentence on what the pattern means for risk"
}

signs_identified rules: do NOT echo the officer's wording back. Normalise each sign
into clinical terms, dropping subjective language. For example "unpleasant dropping
on the floor" becomes "Rodent droppings". Use standard labels such as: Rodent
droppings, Gnaw marks, Burrow/nest, Live sighting, Grease marks, Urine odour,
Food source exposed, Structural gap.

confidence rules: state how confident this assessment is given the detail provided.
A single vague sentence with no location is "low". A specific description with
multiple signs, or corroborating prior reports, is "moderate" or "high". Be honest -
this is an inference, not a measurement.

PHOTOGRAPH (when provided): a field photo may accompany the note. Read it as
primary evidence, not decoration. Identify what is actually visible - droppings and
their size and freshness, gnaw marks, burrows, grease trails, nesting material,
exposed food waste, structural gaps. Ground signs_identified in what you can SEE,
not only what the officer wrote.

If the photo and the note disagree, say so in likely_cause and lower confidence.
An officer who writes "a few droppings" over a photo showing heavy infestation is
the exact case this feature exists to catch. If the photo is too dark, blurred or
close-cropped to judge, say that plainly and set confidence to "low" rather than
guessing.

RECURRENCE (important): you may be given prior observations at the same location.
Recurrence at one location is a strong risk escalator - repeated droppings at the
same block indicate an established, not transient, presence. If prior observations
exist, factor them into risk_level and explain the pattern in recurrence_note. A
sign that would be "low" in isolation should usually be raised to at least "medium"
if the same location reported similar signs within the last week.

Each immediate_actions item MUST have a short "title" (2-3 words) that front-loads
the action, plus a "detail" sentence.

Risk level guide:
- low: minor droppings only, no active nesting, isolated to one area, no prior reports
- medium: multiple signs, possible nesting, near but not inside buildings, OR a repeat report at the same location
- high: active infestation signs, inside building areas, near food sources or gardens, or a persistent recurring pattern
- critical: large-scale infestation, confirmed nesting, near resident common areas or food sources, rapid escalation needed

Keep immediate_actions practical and specific to what a field officer can do.
Do not recommend chemical pesticide application - that requires a licensed contractor.
Escalate to contractor when the situation is beyond self-treatment scope.`;

  const prompt = buildPrompt({ block, floorLevel, observations, history, hasImage: Boolean(image) });

  // Multimodal when a photo is attached: the image is sent inline rather than as a
  // URL, so the assessment does not depend on the image host being reachable.
  const contents = image
    ? [{ role: 'user', parts: [
        { inlineData: { mimeType: image.mimeType, data: image.data } },
        { text: prompt },
      ] }]
    : prompt;

  const response = await withTimeout(ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents,
    config: {
      systemInstruction,
      responseMimeType: 'application/json',
    },
  }), 15000, 'Gemini rodent assessment');

  const raw = (response.text || '').trim();
  const cleaned = raw.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim();

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    console.error('gemini returned non-JSON for rodent assessment:', raw);
    throw new Error('AI returned an unexpected format. Please try again.');
  }

  const validLevels = ['low', 'medium', 'high', 'critical'];
  if (!validLevels.includes(parsed.risk_level)) {
    throw new Error(`unexpected risk_level value: ${parsed.risk_level}`);
  }

  parsed.immediate_actions = normalizeActions(parsed.immediate_actions);
  if (!['low', 'moderate', 'high'].includes(parsed.confidence)) parsed.confidence = 'moderate';

  return parsed;
}

function normalizeActions(actions) {
  if (!Array.isArray(actions)) return [];
  return actions.map(a => {
    if (a && typeof a === 'object') {
      return { title: a.title || '', detail: a.detail || a.text || '' };
    }
    return { title: '', detail: String(a) };
  });
}

function buildPrompt({ block, floorLevel, observations, history = [], hasImage = false }) {
  const location = [block, floorLevel].filter(Boolean).join(', ');
  let historyBlock = '';
  if (history.length > 0) {
    const lines = history.map(h => {
      const when = new Date(h.createdAt).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' });
      return `- ${when} (${h.risk_level}): ${h.observations}`;
    }).join('\n');
    historyBlock = `\n\nPRIOR OBSERVATIONS AT THIS LOCATION (last 7 days) - ${history.length} report(s):\n${lines}\n\nThis is a RECURRING location. Factor this pattern into your risk assessment.`;
  } else {
    historyBlock = '\n\nNo prior observations at this location in the last 7 days.';
  }

  const imgLine = hasImage
    ? '\n\nA field photograph of the site is attached. Assess what is visible in it as primary evidence.'
    : '';

  return `Location: ${location || 'not specified'}

Field officer observations:
${observations.trim()}${imgLine}${historyBlock}

Assess the rodent risk based on the observations${hasImage ? ', the attached photograph' : ''} AND any recurrence pattern, then return the JSON assessment.`;
}

// fallback stub for when there is no api key or the AI call fails
function stubAssessment(observations, history = []) {
  const hasDroppings = /dropping|faece|pellet/i.test(observations);
  const hasNesting = /nest|gnaw|burrow|hole/i.test(observations);
  const nearGarden = /garden|plant|compost/i.test(observations);

  let level = hasNesting && nearGarden ? 'high'
    : hasNesting || nearGarden ? 'medium'
    : 'low';
  // recurrence elevates risk even in the stub, so the fallback stays honest
  let recurrence_note = null;
  if (history.length > 0) {
    recurrence_note = `${history.length} similar observation(s) at this location in the last 7 days — recurrence raises the risk above an isolated incident.`;
    if (level === 'low') level = 'medium';
    else if (level === 'medium') level = 'high';
  }

  return {
    risk_level: level,
    confidence: 'low',
    likely_cause: 'Assessment based on stub logic (no API key). Set GEMINI_API_KEY for real AI assessment.',
    signs_identified: hasDroppings ? ['Rodent droppings'] : ['General signs noted'],
    immediate_actions: [
      { title: 'Document Location', detail: 'Record the exact location with photos for the case file.' },
      { title: 'Inspect Vicinity', detail: 'Check for additional signs within a 10m radius of the observation.' },
      { title: 'Clear Attractants', detail: 'Remove any accessible food sources or debris that draw rodents.' },
      { title: 'Re-inspect', detail: 'Return to re-inspect the area within 48 hours.' },
    ],
    escalate_to_contractor: level === 'high',
    escalation_reason: level === 'high' ? 'Multiple risk factors present — beyond self-treatment scope' : null,
    estimated_timeline: level === 'high' ? 'Same day' : 'Within 3 days',
    recurrence_note,
    stubbed: true,
  };
}

module.exports = { assessRodentRisk, hasApiKey, stubAssessment };