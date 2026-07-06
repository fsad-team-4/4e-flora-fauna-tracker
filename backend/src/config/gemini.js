const { GoogleGenAI } = require('@google/genai');

let client = null;

// Lazily create (and cache) the Gemini client. Lazy so the server (and tests)
// can boot without GEMINI_API_KEY set - the key is only needed when the AI
// summary endpoint is actually called.
function getGeminiClient() {
  if (client) return client;
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not set');
  }
  client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return client;
}

module.exports = { getGeminiClient };
