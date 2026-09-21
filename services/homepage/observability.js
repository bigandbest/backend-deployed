// Structured, single-line JSON logging for the homepage feed (plan §30). No logging library exists in the backend,
// so this is console-based and swappable. NEVER log pincodes, tokens, user ids or IPs (pincode only as a boolean).

const LEVELS = { info: 'log', warn: 'warn', error: 'error' };

export function logEvent(event, fields = {}, level = 'info') {
  try {
    // eslint-disable-next-line no-console
    console[LEVELS[level] || 'log'](JSON.stringify({ event, ts: new Date().toISOString(), ...fields }));
  } catch {
    /* logging must never throw */
  }
}

/** Monotonic ms timer. */
export const startTimer = () => {
  const t0 = process.hrtime.bigint();
  return () => Number((process.hrtime.bigint() - t0) / 1000000n);
};
