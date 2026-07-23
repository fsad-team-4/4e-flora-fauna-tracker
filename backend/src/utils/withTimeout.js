// Bound a promise so a hung upstream (e.g. the Gemini API) can never hang a
// request forever. Rejects with a clear error after `ms`, which callers turn
// into a graceful fallback or a clean 5xx instead of an open connection.
function withTimeout(promise, ms, label = 'operation') {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

module.exports = { withTimeout };
