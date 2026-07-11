// angelyn
// rodent risk assessment via gemini
// this is the "ai sensemaking" feature for sector 2
//
// staff describes what they saw on the ground.
// gemini returns a structured risk assessment: level, cause, actions, escalate flag.
// this turns messy unstructured field notes into actionable intelligence.

const { GoogleGenAI } = require('@google/genai');

const ai = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  : null;

function hasApiKey() {
  return ai !== null;
}

async function assessRodentRisk({ block, floorLevel, observations }) {
  if (!ai) {
    throw new Error('GEMINI_API_KEY not set');
  }

  const systemInstruction = `You are an estate pest management advisor for a Singapore Town Council.
You help field officers assess rodent risk from on-ground observations.

You MUST respond with ONLY a valid JSON object. No preamble, no explanation, no markdown fences.
The JSON must match this exact structure:
{
  "risk_level": "low" | "medium" | "high" | "critical",
  "likely_cause": "string - one sentence explaining the most probable cause",
  "signs_identified": ["array", "of", "specific", "signs", "mentioned"],
  "immediate_actions": [
    { "title": "2-3 word action summary", "detail": "one sentence describing the concrete action for the field officer" }
  ],
  "escalate_to_contractor": true | false,
  "escalation_reason": "string if escalate is true, null if false",
  "estimated_timeline": "string - how urgently this needs to be addressed"
}

Each immediate_actions item MUST have a short "title" (2-3 words, e.g. "Inspect Vicinity", "Locate Entry Points", "Educate Residents") that front-loads the action, plus a "detail" sentence. The title lets an officer scan the steps at a glance.

Risk level guide:
- low: minor droppings only, no active nesting, isolated to one area
- medium: multiple signs, possible nesting, near but not inside buildings
- high: active infestation signs, inside building areas, near food sources or gardens
- critical: large-scale infestation, confirmed nesting, near resident common areas or food sources, rapid escalation needed

Keep immediate_actions practical and specific to what a field officer can do.
Do not recommend chemical pesticide application - that requires a licensed contractor.
Escalate to contractor when the situation is beyond self-treatment scope.`;

  const prompt = buildPrompt({ block, floorLevel, observations });

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: prompt,
    config: {
      systemInstruction,
      // ask gemini to return json directly - cleaner than parsing loose text
      responseMimeType: 'application/json',
    },
  });

  const raw = (response.text || '').trim();

  // strip markdown fences just in case the model wraps the json
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

  // normalise actions: accept the new {title, detail} shape, but if the model
  // ever returns plain strings, wrap them so downstream always gets objects.
  parsed.immediate_actions = normalizeActions(parsed.immediate_actions);

  return parsed;
}

// keep action shape consistent regardless of what the model returns
function normalizeActions(actions) {
  if (!Array.isArray(actions)) return [];
  return actions.map(a => {
    if (a && typeof a === 'object') {
      return { title: a.title || '', detail: a.detail || a.text || '' };
    }
    return { title: '', detail: String(a) };
  });
}

function buildPrompt({ block, floorLevel, observations }) {
  const location = [block, floorLevel].filter(Boolean).join(', ');
  return `Location: ${location || 'not specified'}

Field officer observations:
${observations.trim()}

Assess the rodent risk based on these observations and return the JSON assessment.`;
}

// fallback stub for when there is no api key
function stubAssessment(observations) {
  const hasDroppings = /dropping|faece|pellet/i.test(observations);
  const hasNesting = /nest|gnaw|burrow|hole/i.test(observations);
  const nearGarden = /garden|plant|compost/i.test(observations);

  const level = hasNesting && nearGarden ? 'high'
    : hasNesting || nearGarden ? 'medium'
    : 'low';

  return {
    risk_level: level,
    likely_cause: 'Assessment based on stub logic (no API key). Set GEMINI_API_KEY for real AI assessment.',
    signs_identified: hasDroppings ? ['rodent droppings observed'] : ['general signs noted'],
    immediate_actions: [
      { title: 'Document Location', detail: 'Record the exact location with photos for the case file.' },
      { title: 'Inspect Vicinity', detail: 'Check for additional signs within a 10m radius of the observation.' },
      { title: 'Clear Attractants', detail: 'Remove any accessible food sources or debris that draw rodents.' },
      { title: 'Re-inspect', detail: 'Return to re-inspect the area within 48 hours.' },
    ],
    escalate_to_contractor: level === 'high',
    escalation_reason: level === 'high' ? 'Multiple risk factors present — beyond self-treatment scope' : null,
    estimated_timeline: level === 'high' ? 'Same day' : 'Within 3 days',
    stubbed: true,
  };
}

module.exports = { assessRodentRisk, hasApiKey, stubAssessment };