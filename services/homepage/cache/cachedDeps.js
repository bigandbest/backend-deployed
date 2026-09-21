// Read-through cache wrappers around the feed's IO dependencies (plan §23). Each wrapper has the SAME signature as
// the dependency it wraps, so HomepageFeedService is unaware of caching. Redis failure = plain DB path
// (lib/redis helpers swallow errors and return null).
//
// HOMEPAGE_CACHE=off bypasses every layer (kill switch / debugging).

import {
  HOMEPAGE_PLAN_TTL, HOMEPAGE_SELECTION_TTL, HOMEPAGE_PRODUCT_TTL,
  homepagePlanKey, homepageSelectionKey, homepageProductKey, homepageSectionViewKey,
} from '../../../lib/cacheKeys.js';
import { getDefinition } from '../registry/index.js';

export const cacheEnabled = (env = process.env) => String(env.HOMEPAGE_CACHE ?? 'on').toLowerCase() !== 'off';

// Types whose resolved view is self-contained (no shared entities), so the whole view can be cached.
// Category-based types register shared category entities into the request store → not view-cached.
export const VIEW_CACHEABLE_TYPES = new Set([
  'HERO_CAROUSEL', 'BANNER_STRIP', 'MOBILE_BANNERS', 'PROMO_CARDS', 'VIDEO_CARDS',
  'DEAL_CARDS', 'BRAND_GRID', 'STORE_GRID', 'TESTIMONIALS', 'TABBED_PRODUCTS',
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
      const fresh = await selectProducts(misses);
      const writes = [];
      for (const s of misses) {
        const ids = fresh.get(s.id) ?? [];
        result.set(s.id, ids);
        writes.push([homepageSelectionKey(s.id), { source: s.source, limit: s.limit, ids }]);
      }
      await store.setMany(writes, HOMEPAGE_SELECTION_TTL);
    }
    return result;
  };
}

export function cachedHydrateProducts(hydrateProducts, { store, enabled = cacheEnabled } = {}) {
  return async (ids, opts = {}) => {
    if (!enabled()) return hydrateProducts(ids, opts);
    const wh = opts.warehouseId ?? null;
    const cached = await store.mget(ids.map((id) => homepageProductKey(wh, id)));
    const out = new Map();
    const misses = [];
    ids.forEach((id, i) => (cached[i] ? out.set(id, cached[i]) : misses.push(id)));
    if (misses.length) {
      const fresh = await hydrateProducts(misses, opts);
      const writes = [];
      for (const [id, p] of fresh) { out.set(id, p); writes.push([homepageProductKey(wh, id), p]); }
      await store.setMany(writes, HOMEPAGE_PRODUCT_TTL);
    }
    return out;
  };
}

/** Wrap a self-contained resolver with a per-section view cache. Validity is tied to the section row's updated_at. */
export function cachedResolver(type, resolver, { store, enabled = cacheEnabled } = {}) {
  if (!VIEW_CACHEABLE_TYPES.has(type)) return resolver;
  return async (args) => {
    if (!enabled()) return resolver(args);
    const { sections } = args;
    const cached = await store.mget(sections.map((s) => homepageSectionViewKey(s.id)));
    const out = new Map();
    const misses = [];
    sections.forEach((s, i) => {
      const c = cached[i];
      const stamp = s.updated_at ? new Date(s.updated_at).toISOString() : null;
      if (c && c.stamp === stamp) out.set(s.id, c.view); else misses.push(s);
    });
    if (misses.length) {
      const fresh = await resolver({ ...args, sections: misses });
      const ttl = getDefinition(type)?.ttlSec ?? 300;
      const writes = [];
      for (const s of misses) {
        const view = fresh.get(s.id);
        if (!view) continue;
        out.set(s.id, view);
        writes.push([homepageSectionViewKey(s.id), { stamp: s.updated_at ? new Date(s.updated_at).toISOString() : null, view }]);
      }
      await store.setMany(writes, ttl);
    }
    return out;
  };
}
