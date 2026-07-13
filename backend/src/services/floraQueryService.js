// klemens
// Natural-language AI querying over the greenery catalog (M3 feature,
// built on M1's GreeneryRecord catalog).
// Natural-language AI querying over the greenery catalog. Staff ask questions
// in plain English and get answers grounded ONLY in the actual GreeneryRecord
// data - the full catalog is small enough to fit in the prompt, so no
// embeddings or vector search needed.

const { getGeminiClient } = require('../config/gemini');
const { GreeneryRecord } = require('../models');

function hasApiKey() {
  return Boolean(process.env.GEMINI_API_KEY);
}

// One compact line per plant so the whole catalog stays cheap to send.
function formatCatalogLine(record) {
  const height =
    record.max_height_at_maturity != null
      ? `${record.max_height_at_maturity}m`
      : 'unknown';
  return [
    `Species: ${record.species}`,
    `Common name: ${record.common_name || 'unknown'}`,
    `Family: ${record.plant_family || 'unknown'}`,
    `Zone: ${record.location_zone || 'unspecified'}`,
    `Health: ${record.health_status}`,
    `Max height: ${height}`,
    `Site suitability: ${record.site_suitability || 'unknown'}`,
    `Colour: ${record.color || 'unknown'}`,
    `Notes: ${record.health_notes || 'none'}`,
  ].join(' | ');
}

function buildPrompt(question, records) {
  const catalog = records.map(formatCatalogLine).join('\n');

  return `You are a horticulture assistant for Town Council estate maintenance staff in Singapore. Staff ask you questions about the estate's greenery catalog.

Answer using ONLY the catalog data below. Do not use outside knowledge about plants that are not in the catalog. If the catalog does not contain the information needed to answer, say so clearly rather than inventing an answer.

Be practical and action-oriented - staff want to know what to do, where to go, and which plants are affected. Answer in plain text only - no markdown, no asterisks, no bold. Keep the answer under 150 words.

Catalog (${records.length} plants, one per line):
${catalog}

Staff question: ${question}

Answer:`;
}

async function queryCatalog(question) {
  const records = await GreeneryRecord.findAll({
    where: { is_deleted: false },
  });

  const client = getGeminiClient();
  const response = await client.models.generateContent({
    model: 'gemini-3.5-flash',
    contents: buildPrompt(question, records),
    config: { maxOutputTokens: 1024, thinkingConfig: { thinkingBudget: 0 } },
  });

  return { answer: (response.text || '').trim(), plantCount: records.length };
}

module.exports = { queryCatalog, hasApiKey };
