// In-process single-flight: concurrent callers asking for the same key share ONE in-flight computation instead of
// each running it. Per process only (PM2 workers each have their own map); the Redis cache in front of it is what is
// shared across processes. The entry is removed when the computation settles, so nothing is cached here.

/**
 * @returns {(key: string, fn: () => Promise<any>) => { promise: Promise<any>, joined: boolean }}
 */
export function createSingleFlight() {
  const inflight = new Map();
  return (key, fn) => {
    const existing = inflight.get(key);
    if (existing) return { promise: existing, joined: true };
    const p = Promise.resolve().then(fn).finally(() => inflight.delete(key));
    inflight.set(key, p);
    return { promise: p, joined: false };
  };
}
