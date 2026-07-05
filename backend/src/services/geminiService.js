// angelyn
// gemini integration for the weekly estate health summary
// (team standardised on gemini instead of claude - klemens' call)
// generates the briefing text from the week's data
//
// filename kept as geminiService.js - the rest of the code imports from here.
// if anything still requires ./claudeService, update it to ./geminiService

const { GoogleGenAI } = require('@google/genai');

// only create the client if a key is present
// lets the app keep working for teammates who dont have a key yet
// (weeklySummary.js falls back to a stub if hasApiKey() is false)
const ai = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  : null;

function hasApiKey() {
  return ai !== null;
}

async function generateSummary(stats) {
  if (!ai) {
    throw new Error('GEMINI_API_KEY not set');
  }

  const prompt = buildPrompt(stats);

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: prompt,
  });

  // the SDK exposes the plain text on response.text
  return (response.text || '').trim();
}

// the prompt is the most important part of this feature.
// design decisions:
//  - cast the model as a property manager, not "an AI" - keeps the tone human
//  - ask for paragraphs not bullets - reads like a real briefing, not a data dump
//  - tell it to lead with the most urgent item - managers skim
//  - explicitly forbid inventing data - stops hallucinated block numbers
//  - feed specific block numbers so staff know where to go
function buildPrompt(stats) {
  const criticalList = stats.criticalPlants.length
    ? stats.criticalPlants.join('; ')
    : 'none';
  const atRiskList = stats.atRiskPlants.length
    ? stats.atRiskPlants.join('; ')
    : 'none';
  const hotspotList = stats.hotspots.length
    ? stats.hotspots.map(h => `${h.block} (${h.count} sightings)`).join('; ')
    : 'none';
  const openTitles = stats.openCaseTitles.length
    ? stats.openCaseTitles.join('; ')
    : 'none';

  return `You are the operations manager for a Town Council estate, writing the weekly health briefing for your director. The estate covers greenery (bushes and shrubs), community cats, pigeons, and resident-reported issues.

Write a briefing of about 150 to 180 words. Your director is busy and wants to know what needs action this week, not a list of numbers.

Guidelines:
- Lead with the single most urgent item, if there is one.
- Write in flowing paragraphs, like a person would. No bullet points, no headings, no markdown.
- Mention specific block numbers so staff know where to go.
- Group related points together naturally instead of going field by field.
- If an area is fine, say so briefly rather than padding it out.
- Do not invent any data that is not given below.

This week's data:

Plant health
- Critical condition: ${criticalList}
- At risk: ${atRiskList}

Animal activity
- Total sightings logged: ${stats.totalSightings}
- Hotspot blocks (three or more sightings): ${hotspotList}

Cases
- Open: ${stats.openCaseCount}
- Resolved this week: ${stats.resolvedCount}
- Open case summaries: ${openTitles}

Write only the briefing text. Do not include a greeting, a sign-off, or any preamble.`;
}

module.exports = { generateSummary, hasApiKey, buildPrompt };
