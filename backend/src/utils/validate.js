// Reusable request-body validation. A malformed payload becomes a clean 400 with
// a readable message instead of blowing up deeper in the handler as a 500.
function validateBody(schema) {
  return async (req, res, next) => {
    try {
      await schema.validate(req.body, { abortEarly: false });
      next();
    } catch (err) {
      return res.status(400).json({ error: (err.errors || ['Invalid request body']).join(', ') });
    }
  };
}

module.exports = { validateBody };
