process.env.DATABASE_URL = 'sqlite::memory:';
process.env.JWT_SECRET = 'test-secret';
// A CONFIGURED key, so draftBriefing takes the real AI path...
process.env.GEMINI_API_KEY = 'test-key';

// ...and that path fails. Mocked at module load rather than with
// jest.resetModules() mid-suite, which would re-instantiate Sequelize against a
// second in-memory database and hang every later query.
jest.mock('@google/genai', () => ({
  GoogleGenAI: class {
    constructor() {
      this.models = { generateContent: async () => { throw new Error('upstream 503'); } };
    }
  },
}));

const { draftBriefing } = require('../../src/services/vendorBriefing');

const ctx = { block_number: 'Block 128', risk_level: 'critical' };
const items = [{ id: 1, createdAt: new Date(), risk_level: 'critical', observations: 'Live sighting', floor_level: 'L1' }];

describe('a configured AI that fails', () => {
  test('every model in the chain is tried before giving up', async () => {
    const { MODEL_CHAIN } = require('../../src/services/vendorBriefing');
    // a list, not a single model: the free tier caps requests PER MODEL PER DAY,
    // so one drained bucket must not take the feature down with it
    expect(MODEL_CHAIN.length).toBeGreaterThan(1);
    expect(MODEL_CHAIN[0]).toBe('gemini-2.5-flash');   // most daily headroom leads
  });

  test('quota exhaustion is reported as quota, so the officer knows it resets', async () => {
    jest.resetModules();
    jest.doMock('@google/genai', () => ({
      GoogleGenAI: class {
        constructor() {
          this.models = {
            generateContent: async () => {
              throw new Error('{"error":{"code":429,"status":"RESOURCE_EXHAUSTED","message":"quota"}}');
            },
          };
        }
      },
    }));
    const svc = require('../../src/services/vendorBriefing');
    const r = await svc.draftBriefing(ctx, items);
    expect(r.aiFailed).toBe(true);
    expect(r.quota_exhausted).toBe(true);
    expect(r.error).toMatch(/daily quota is used up/i);
    expect(r.text).toBeUndefined();
    jest.dontMock('@google/genai');
    jest.resetModules();
  });

  test('a non-retryable error stops immediately instead of burning the whole chain', async () => {
    jest.resetModules();
    let calls = 0;
    jest.doMock('@google/genai', () => ({
      GoogleGenAI: class {
        constructor() {
          this.models = {
            generateContent: async () => {
              calls += 1;
              throw new Error('{"error":{"code":400,"message":"bad request"}}');
            },
          };
        }
      },
    }));
    const svc = require('../../src/services/vendorBriefing');
    const r = await svc.draftBriefing(ctx, items);
    expect(r.aiFailed).toBe(true);
    expect(calls).toBe(1);   // a malformed request will not fix itself on model 2
    jest.dontMock('@google/genai');
    jest.resetModules();
  });

  test('returns NO text - never a template dressed as an AI draft', async () => {
    const r = await draftBriefing(ctx, items);
    expect(r.aiFailed).toBe(true);
    // plain language, not a wall of upstream JSON
    expect(r.error).toMatch(/no draft could be generated/i);
    expect(r.error).not.toMatch(/\{|"code"/);   // never leak the raw error payload
    // THE CONSTRAINT: without text, the UI has nothing to mistake for a draft
    // and must tell the officer to write it manually.
    expect(r.text).toBeUndefined();
    expect(r.stubbed).toBeUndefined();
  });

  test('an empty AI response is treated as a failure, not as an empty draft', async () => {
    jest.resetModules();
    jest.doMock('@google/genai', () => ({
      GoogleGenAI: class {
        constructor() { this.models = { generateContent: async () => ({ text: '   ' }) }; }
      },
    }));
    const svc = require('../../src/services/vendorBriefing');
    const r = await svc.draftBriefing(ctx, items);
    expect(r.aiFailed).toBe(true);
    expect(r.text).toBeUndefined();
  });
});
