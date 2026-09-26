// Read-through JSON cache with in-process single-flight, for shared (non-personalised) payloads.
//
//   const base = await readThrough('name', key, ttlSeconds, () => loadFromDb());
//
// - HIT:  returns the cached value.
// - MISS: exactly one loader runs per key per process; concurrent callers for the same key wait for it instead of each
//         hitting the DB. The result is written to Redis (awaited, so callers arriving right after see it) and shared.
// - Redis trouble (down / slow / bad JSON) degrades to a plain DB read; loader errors are NOT cached and reject every
//   caller that was waiting on that flight.
// Callers must not mutate the returned object (it is shared by concurrent callers of the same flight) — copy first.

import { redisGet, redisSet } from './redis.js';
import { createSingleFlight } from './singleFlight.js';
import { cacheEvent } from './perfMetrics.js';

const flight = createSingleFlight();

export async function readThrough(name, key, ttlSeconds, loader) {
  const hit = await redisGet(key);
  if (hit) { cacheEvent(name, 'hit'); return hit; }

  const { promise, joined } = flight(key, async () => {
    const value = await loader();
    await redisSet(key, value, ttlSeconds); // swallows Redis errors
    return value;
  });
  const value = await promise;
  cacheEvent(name, joined ? 'joined' : 'miss');
  return value;
}
