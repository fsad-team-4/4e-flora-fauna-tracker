// Per-IP request limits. A generous global cap protects the whole API; a tighter
// cap guards the AI routes, which call Gemini (real cost + an abuse surface).
// Disabled under test so the suite can fire many requests from one address.
const rateLimit = require('express-rate-limit');

const passthrough = (req, res, next) => next();
const testMode = process.env.NODE_ENV === 'test';

const apiLimiter = testMode ? passthrough : rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests - please slow down and try again shortly.' },
});

const aiLimiter = testMode ? passthrough : rateLimit({
  windowMs: 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'AI request limit reached - please wait a minute and try again.' },
});

module.exports = { apiLimiter, aiLimiter };
