// Read-through cache wrappers around the feed's IO dependencies (plan §23). Each wrapper has the SAME signature as
// the dependency it wraps, so HomepageFeedService is unaware of caching. Redis failure = plain DB path
// (lib/redis helpers swallow errors and return null).
//
// HOMEPAGE_CACHE=off bypasses every layer (kill switch / debugging).

import {
  HOMEPAGE_PLAN_TTL, HOMEPAGE_SELECTION_TTL, HOMEPAGE_PRODUCT_TTL, HOMEPAGE_CATEGORIES_TTL,
  homepagePlanKey, homepageSelectionKey, homepageProductKey, homepageSectionViewKey, homepageCategoriesKey,
} from '../../../lib/cacheKeys.js';
import { getDefinition } from '../registry/index.js';

export const cacheEnabled = (env = process.env) => String(env.HOMEPAGE_CACHE ?? 'on').toLowerCase() !== 'off';

// Types whose resolved view is self-contained (no shared entities), so the whole view can be cached.
// Category-based types register shared category entities into the request store → not view-cached.
export const VIEW_CACHEABLE_TYPES = new Set([
  'HERO_CAROUSEL', 'BANNER_STRIP', 'MOBILE_BANNERS', 'PROMO_CARDS', 'VIDEO_CARDS',
  'DEAL_CARDS', 'BRAND_GRID', 'BRAND_PARTNERS', 'STORE_GRID', 'TESTIMONIALS', 'TABBED_PRODUCTS',
]);

/**
 * Cache store adapter. Production: Redis via lib/redis.js (imported lazily so tests never open a connection).
 * @typedef {{ get:(k:string)=>Promise<any>, set:(k:string,v:any,ttl:number)=>Promise<void>, mget:(ks:string[])=>Promise<any[]>, setMany:(entries:[string,any][],ttl:number)=>Promise<void> }} CacheStore
 */
export async function createRedisStore() {
  const { getRedisClient, redisGet, redisSet, redisMGet } = await import('../../../lib/redis.js');
  return {
    get: (k) => redisGet(k),
    set: async (k, v, ttl) => { await redisSet(k, v, ttl); },
    mget: (ks) => redisMGet(ks),
    setMany: async (entries, ttl) => {
      if (entries.length === 0) return;
      try {
        const pipe = getRedisClient().pipeline();
        for (const [k, v] of entries) pipe.set(k, JSON.stringify(v), 'EX', ttl);
        await pipe.exec();
      } catch { /* cache write failures never fail a request */ }
    },
  };
}

// In-process single-flight: concurrent misses for the same key share one DB computation (stampede guard).
const inflight = new Map();
const singleFlight = (key, fn) => {
  if (inflight.has(key)) return inflight.get(key);
  const p = Promise.resolve().then(fn).finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
};

// Per-KEY single-flight for the entity caches. On expiry (or after an invalidation) every concurrent feed request used
// to recompute the same keys itself — at hundreds of requests/s that is a stampede of identical DB reads (measured:
// thousands of simultaneous hydrations, timeouts, 1.4 GB RSS). Here a key that is already being computed is joined
// instead of recomputed; each request only computes the keys nobody else has started.
//
//   flights      Map owned by one cache wrapper (key -> Promise)
//   keys         flight keys this request is missing
//   computeOwned async (ownedKeys) => Map(key -> value); MUST write the cache before returning, so callers arriving
//                right after the flight is released find the value in Redis. Keys it omits mean "computed, absent".
// Returns Map(key -> value) for every key that has a value. Waiting callers receive their own structuredClone.
// If the owner throws, the owner rejects exactly as before and waiting callers recompute for themselves.
const FLIGHT_FAILED = Symbol('flight-failed');
const FLIGHT_ABSENT = Symbol('flight-absent');
async function coalesceMisses(flights, keys, computeOwned) {
  const out = new Map();
  const owned = [];
  const joined = [];
  for (const key of keys) {
    const existing = flights.get(key);
    if (existing) { joined.push([key, existing]); continue; }
    let settle;
    flights.set(key, new Promise((resolve) => { settle = resolve; }));
    owned.push({ key, settle });
  }
  if (owned.length > 0) {
    let computed;
    try {
      computed = await computeOwned(owned.map((o) => o.key));
    } catch (err) {
      for (const o of owned) { flights.delete(o.key); o.settle(FLIGHT_FAILED); }
      throw err;
    }
    for (const o of owned) {
      const v = computed.get(o.key);
      if (v !== undefined) out.set(o.key, v);
      flights.delete(o.key);
      o.settle(v === undefined ? FLIGHT_ABSENT : structuredClone(v)); // waiters get a copy; the owner keeps the original
    }
  }
  // Every owned promise is settled above BEFORE waiting on anyone else's, so two requests can never wait on each other.
  const retry = [];
  for (const [key, promise] of joined) {
    const v = await promise;
    if (v === FLIGHT_FAILED) retry.push(key);
    else if (v !== FLIGHT_ABSENT) out.set(key, structuredClone(v));
  }
  if (retry.length > 0) for (const [k, v] of await computeOwned(retry)) out.set(k, v);
  return out;
}

export function cachedLoadPlan(loadPlan, { store, enabled = cacheEnabled } = {}) {
  return async () => {
    if (!enabled()) return loadPlan();
    const hit = await store.get(homepagePlanKey());
    if (hit) return hit;
    return singleFlight(homepagePlanKey(), async () => {
      const plan = await loadPlan();
      store.set(homepagePlanKey(), plan, HOMEPAGE_PLAN_TTL);
      return plan;
    });
  };
}

export function cachedSelectProducts(selectProducts, { store, enabled = cacheEnabled } = {}) {
  const flights = new Map();
  return async (specs) => {
    if (!enabled()) return selectProducts(specs);
    const cached = await store.mget(specs.map((s) => homepageSelectionKey(s.id)));
    const result = new Map();
    const misses = [];
    specs.forEach((s, i) => {
      const c = cached[i];
      // A stored selection is only valid for the exact source+limit it was computed with.
      if (c && c.source === s.source && c.limit === s.limit && Array.isArray(c.ids)) result.set(s.id, c.ids);
      else misses.push(s);
    });
    if (misses.length) {
      // flight key includes source+limit: a selection computed for other parameters is never shared
      const fk = (s) => `${s.id}:${s.source}:${s.limit}`;
      const specByKey = new Map(misses.map((s) => [fk(s), s]));
      const fresh = await coalesceMisses(flights, [...specByKey.keys()], async (ownedKeys) => {
        const ownedSpecs = ownedKeys.map((k) => specByKey.get(k));
        const selected = await selectProducts(ownedSpecs);
        const writes = [];
        const computed = new Map();
        for (const s of ownedSpecs) {
          const ids = selected.get(s.id) ?? [];
          computed.set(fk(s), ids);
          writes.push([homepageSelectionKey(s.id), { source: s.source, limit: s.limit, ids }]);
        }
        await store.setMany(writes, HOMEPAGE_SELECTION_TTL);
        return computed;
      });
      for (const s of misses) result.set(s.id, fresh.get(fk(s)) ?? []);
    }
    return result;
  };
}

export function cachedHydrateProducts(hydrateProducts, { store, enabled = cacheEnabled } = {}) {
  const flights = new Map();
  return async (ids, opts = {}) => {
    if (!enabled()) return hydrateProducts(ids, opts);
    const wh = opts.warehouseId ?? null;
    const cached = await store.mget(ids.map((id) => homepageProductKey(wh, id)));
    const out = new Map();
    const misses = [];
    ids.forEach((id, i) => (cached[i] ? out.set(id, cached[i]) : misses.push(id)));
    if (misses.length) {
      // flight key = the product's cache key, so warehouses never share a flight
      const idByKey = new Map(misses.map((id) => [homepageProductKey(wh, id), id]));
      const fresh = await coalesceMisses(flights, [...idByKey.keys()], async (ownedKeys) => {
        const products = await hydrateProducts(ownedKeys.map((k) => idByKey.get(k)), opts);
        const writes = [];
        const computed = new Map();
        for (const [id, p] of products) { computed.set(homepageProductKey(wh, id), p); writes.push([homepageProductKey(wh, id), p]); }
        await store.setMany(writes, HOMEPAGE_PRODUCT_TTL);
        return computed;
      });
      for (const [key, id] of idByKey) if (fresh.has(key)) out.set(id, fresh.get(key));
    }
    return out;
  };
}

/**
 * Wrap the category-hierarchy loader factory (resolvers/index.js `makeCategoryLoader`) with cross-request Redis
 * caching. The wrapped loader keeps its own per-request memoization (one DB/Redis read shared by every resolver
 * in one feed, e.g. CATEGORY_GRID + DUAL_CATEGORY_PAIR), on top of which this adds a shared Redis entry so
 * consecutive requests don't repeat the DB round trip — a raw per-request query alone means every homepage load
 * pays full DB latency, which on a remote/pooled Postgres can approach or exceed a resolver's timeout budget.
 */
export function cachedCategoryLoader(rawFactory, { store, enabled = cacheEnabled } = {}) {
  return () => {
    let cached;
    return () => {
      cached ??= (async () => {
        if (!enabled()) return rawFactory()();
        const key = homepageCategoriesKey();
        const hit = await store.get(key);
        if (hit) return new Map(hit);
        return singleFlight(key, async () => {
          const map = await rawFactory()();
          await store.set(key, [...map.entries()], HOMEPAGE_CATEGORIES_TTL);
          return map;
        });
      })();
      return cached;
    };
  };
}

/** Wrap a self-contained resolver with a per-section view cache. Validity is tied to the section row's updated_at. */
export function cachedResolver(type, resolver, { store, enabled = cacheEnabled } = {}) {
  if (!VIEW_CACHEABLE_TYPES.has(type)) return resolver;
  const flights = new Map();
  const stampOf = (s) => (s.updated_at ? new Date(s.updated_at).toISOString() : null);
  return async (args) => {
    if (!enabled()) return resolver(args);
    const { sections } = args;
    const cached = await store.mget(sections.map((s) => homepageSectionViewKey(s.id)));
    const out = new Map();
    const misses = [];
    sections.forEach((s, i) => {
      const c = cached[i];
      if (c && c.stamp === stampOf(s)) out.set(s.id, c.view); else misses.push(s);
    });
    if (misses.length) {
      // flight key includes the section stamp: an edited section is never served another version's view
      const fk = (s) => `${type}:${s.id}:${stampOf(s)}`;
      const sectionByKey = new Map(misses.map((s) => [fk(s), s]));
      const fresh = await coalesceMisses(flights, [...sectionByKey.keys()], async (ownedKeys) => {
        const ownedSections = ownedKeys.map((k) => sectionByKey.get(k));
        const resolved = await resolver({ ...args, sections: ownedSections });
        const ttl = getDefinition(type)?.ttlSec ?? 300;
        const writes = [];
        const computed = new Map();
        for (const s of ownedSections) {
          const view = resolved.get(s.id);
          if (!view) continue;
          computed.set(fk(s), view);
          writes.push([homepageSectionViewKey(s.id), { stamp: stampOf(s), view }]);
        }
        await store.setMany(writes, ttl);
        return computed;
      });
      for (const s of misses) if (fresh.has(fk(s))) out.set(s.id, fresh.get(fk(s)));
    }
    return out;
  };
}
