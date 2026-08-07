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

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Index of the first case-insensitive, whole-word occurrence of `name` in
// `text`, or -1. Names can be multi-word, so the boundaries are lookarounds
// rather than \b.
function firstMentionIndex(text, name) {
  const trimmed = (name || '').trim();
  if (trimmed === '') return -1;
  const pattern = new RegExp(`(?<![A-Za-z0-9])${escapeRegex(trimmed)}(?![A-Za-z0-9])`, 'i');
  const match = pattern.exec(text);
  return match ? match.index : -1;
}

// Which catalog plants the answer mentions, in the order they first appear.
// Matching only ever runs against records fetched from the database, so a
// plant the model invents can never end up here.
function findReferencedPlants(answer, records) {
  const mentions = [];
  records.forEach((record) => {
    const indexes = [
      firstMentionIndex(answer, record.species),
      firstMentionIndex(answer, record.common_name),
    ].filter((index) => index !== -1);
    if (indexes.length > 0) {
      mentions.push({ index: Math.min(...indexes), record });
    }
  });

  mentions.sort((a, b) => a.index - b.index);

  const seen = new Set();
  const referenced = [];
  mentions.forEach(({ record }) => {
    if (seen.has(record.id)) return;
    seen.add(record.id);
    referenced.push({
      id: record.id,
      species: record.species,
      common_name: record.common_name,
    });
  });
  return referenced;
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

  const answer = (response.text || '').trim();

  return {
    answer,
    plantCount: records.length,
    referencedPlants: findReferencedPlants(answer, records),
  };
}

module.exports = { queryCatalog, hasApiKey };
