// angelyn
// rodent risk assessment via claude
// this is the "ai sensemaking" feature for sector 2 coverage
//
// the key design difference from the handbook chatbot:
// - handbook chatbot: conversational, retrieval-based, returns prose
// - rodent assessment: form-based, structured output, returns JSON
//
// staff describes what they saw on the ground.
// claude returns a structured risk assessment: level, cause, actions, escalate flag.
// this turns messy unstructured field notes into actionable intelligence.

const Anthropic = require('@anthropic-ai/sdk');

const client = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

function hasApiKey() {
  return client !== null;
}

async function assessRodentRisk({ block, floorLevel, observations }) {
  if (!client) {
    throw new Error('ANTHROPIC_API_KEY not set');
  }

  const prompt = buildPrompt({ block, floorLevel, observations });

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 600,
    system: `You are an estate pest management advisor for a Singapore Town Council. 
You help field officers assess rodent risk from on-ground observations.

You MUST respond with ONLY a valid JSON object. No preamble, no explanation, no markdown fences.
The JSON must match this exact structure:
{
  "risk_level": "low" | "medium" | "high" | "critical",
  "likely_cause": "string - one sentence explaining the most probable cause",
  "signs_identified": ["array", "of", "specific", "signs", "mentioned"],
  "immediate_actions": ["array", "of", "numbered", "concrete", "actions", "for", "the", "field", "officer"],
  "escalate_to_contractor": true | false,
  "escalation_reason": "string if escalate is true, null if false",
  "estimated_timeline": "string - how urgently this needs to be addressed"
}

Risk level guide:
- low: minor droppings only, no active nesting, isolated to one area
- medium: multiple signs, possible nesting, near but not inside buildings
- high: active infestation signs, inside building areas, near food sources or gardens
- critical: large-scale infestation, confirmed nesting, near resident common areas or food sources, rapid escalation needed

Keep immediate_actions practical and specific to what a field officer can do.
Do not recommend chemical pesticide application - that requires a licensed contractor.
Escalate to contractor when the situation is beyond self-treatment scope.`,
    messages: [{ role: 'user', content: prompt }]
  });

  const raw = response.content
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('')
    .trim();

  // claude sometimes wraps in markdown fences even when told not to
  // strip them just in case
  const cleaned = raw.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim();

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    console.error('claude returned non-JSON for rodent assessment:', raw);
    throw new Error('AI returned an unexpected format. Please try again.');
  }

  // basic sanity check - dont let a malformed response reach the db
  const validLevels = ['low', 'medium', 'high', 'critical'];
  if (!validLevels.includes(parsed.risk_level)) {
    throw new Error(`unexpected risk_level value: ${parsed.risk_level}`);
  }

  return parsed;
}

function buildPrompt({ block, floorLevel, observations }) {
  const location = [block, floorLevel].filter(Boolean).join(', ');
  return `Location: ${location || 'not specified'}

Field officer observations:
${observations.trim()}

Assess the rodent risk based on these observations and return the JSON assessment.`;
}

// fallback stub for when there is no api key
// realistic enough to still demonstrate the feature's purpose
function stubAssessment(observations) {
  const hasDroppings = /dropping|faece|pellet/i.test(observations);
  const hasNesting = /nest|gnaw|burrow|hole/i.test(observations);
  const nearGarden = /garden|plant|compost/i.test(observations);

  const level = hasNesting && nearGarden ? 'high'
    : hasNesting || nearGarden ? 'medium'
    : 'low';

  return {
    risk_level: level,
    likely_cause: 'Assessment based on stub logic (no API key). Set ANTHROPIC_API_KEY for real AI assessment.',
    signs_identified: hasDroppings ? ['rodent droppings observed'] : ['general signs noted'],
    immediate_actions: [
      'Document the exact location with photos',
      'Check for additional signs within 10m radius',
      'Clear any accessible food sources or debris',
      'Re-inspect in 48 hours'
    ],
    escalate_to_contractor: level === 'high',
    escalation_reason: level === 'high' ? 'Multiple risk factors present — beyond self-treatment scope' : null,
    estimated_timeline: level === 'high' ? 'Same day' : 'Within 3 days',
    stubbed: true
  };
}

module.exports = { assessRodentRisk, hasApiKey, stubAssessment };
