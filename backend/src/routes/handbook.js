// angelyn
const express = require('express');
const { protect, restrictTo } = require('../middleware/auth');
const { queryHandbook, hasApiKey } = require('../services/handbookService');

const router = express.Router();

router.use(protect);

// query the handbook - staff and admin only (resident app is separate)
router.post('/query', restrictTo('admin', 'staff'), async (req, res) => {
  const { question, history = [] } = req.body;

  if (!question || !question.trim()) {
    return res.status(400).json({ error: 'question is required' });
  }

  const trimmedHistory = history.slice(-6);

  if (!hasApiKey()) {
    return res.json({
      answer: `[Handbook Assistant is in stub mode - no ANTHROPIC_API_KEY set]\n\nYour question: "${question}"\n\nTo enable real AI responses, add your Anthropic API key to the backend .env file.`,
      question: question.trim(),
      stubbed: true,
    });
  }

  try {
    const result = await queryHandbook(question, trimmedHistory);
    res.json({ ...result, stubbed: false });
  } catch (err) {
    console.error('handbook query failed:', err.message);
    res.status(500).json({ error: 'failed to query handbook. try again.' });
  }
});

// suggested starter questions
router.get('/suggestions', restrictTo('admin', 'staff'), (req, res) => {
  res.json([
    'What are the signs that a Bougainvillea is in critical condition?',
    'How do I treat a fungal infection on estate plants?',
    'What should I do if I find rodents near a planting bed?',
    'When should I escalate a plant issue to the manager instead of self-treating?',
    'How do I identify iron chlorosis and what is the treatment?',
    'What maintenance should be done during dry season?',
    'A resident has set up a community garden and is blocking my access — what do I do?',
    'How do pigeon droppings affect plants and what can I do about it?',
  ]);
});

module.exports = router;
