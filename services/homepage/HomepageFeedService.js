// HomepageFeedService — assembles the typed, ordered, admin-authoritative homepage feed (plan §10).
// All IO is injected (loadPlan, selectProducts, hydrateProducts, resolvers, applyAvailability) so the
// orchestration (ordering, platform filter, INITIAL/DEFERRED, nesting, error isolation) is unit-testable.

import { getDefinition, resolveLoad } from './registry/index.js';
import { validateConfig } from './registry/schema.js';
import { EntityStore } from './entities/EntityStore.js';
import { logEvent, startTimer } from './observability.js';

export const FEED_VERSION = 1;

const withTimeout = (promise, ms, label) => {
  let t;
  const timeout = new Promise((_, reject) => {
    t = setTimeout(() => reject(Object.assign(new Error(`${label} timed out after ${ms}ms`), { code: 'RESOLVER_TIMEOUT' })), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(t));
};

/**
 * @param {Object} deps
 * @param {() => Promise<{sections:object[], mappings:object}>} deps.loadPlan
 * @param {(specs:object[]) => Promise<Map<number,string[]>>} deps.selectProducts
 * @param {(ids:string[], opts:{warehouseId:number|null}) => Promise<Map<string,object>>} deps.hydrateProducts
 * @param {Record<string, Function>} deps.resolvers        type -> resolver
 * @param {() => Function} deps.makeCategoryLoader           per-request memoised hierarchy loader
 * @param {(products:object, pincode:string) => Promise<void>} [deps.applyAvailability]
 * @param {() => Date} [deps.now]
 * @param {number} [deps.initialCount]
 * @param {object} [deps.prisma]                             passed through to resolvers
 */
export function createHomepageFeedService(deps) {
  const {
    loadPlan, selectProducts, hydrateProducts, resolvers, makeCategoryLoader, applyAvailability,
    now = () => new Date(), initialCount = 6, prisma = null,
  } = deps;

  /** Filter to deliverable, platform-eligible top-level sections in feed order, with validated config. */
  function prepare(plan, platform, warnings) {
    const children = new Map();
    for (const s of plan.sections) {
      if (s.parent_section_id != null && s.slot) {
        if (!children.has(s.parent_section_id)) children.set(s.parent_section_id, {});
        children.get(s.parent_section_id)[s.slot] = s;
      }
    }
    const top = [];
    for (const s of plan.sections) {
      if (s.parent_section_id != null) continue;
      const def = getDefinition(s.section_type);
      if (!def) { warnings.push({ key: s.section_key, code: 'UNKNOWN_TYPE' }); continue; }
      if (!def.platforms.includes(platform) || !(s.platforms || []).includes(platform)) continue;

      let cfg = validateConfig(def.configSchema, s.config);
      if (!cfg.ok) {
        // Stored config is invalid (should be impossible via admin API) — fall back to defaults, never fail the feed.
        warnings.push({ key: s.section_key, code: 'INVALID_CONFIG', errors: cfg.errors });
        cfg = validateConfig(def.configSchema, {});
      }
      top.push({ ...s, def, config: cfg.value, children: def.isParent ? children.get(s.id) || {} : undefined });
    }
    return top;
  }

  async function build({ platform, warehouseId = null, pincode = null, keys = null }) {
    const elapsed = startTimer();
    const warnings = [];
    const plan = await loadPlan();
    const top = prepare(plan, platform, warnings);

    const ordered = top.map((s, i) => ({ ...s, position: i + 1, load: resolveLoad(s, i + 1, initialCount) }));

    let targets;
    let gone = [];
    if (keys) {
      const wanted = new Set(keys);
      targets = ordered.filter((s) => wanted.has(s.section_key));
      const found = new Set(targets.map((s) => s.section_key));
      gone = keys.filter((k) => !found.has(k));
    } else {
      targets = ordered.filter((s) => s.load === 'INITIAL');
    }

    const store = new EntityStore();
    const outcome = new Map(); // sectionId -> { status, data?, error? }

    // ── one batched product phase for every product-using section ──
    const productSections = targets.filter((s) => s.def.usesProducts);
    let selection = new Map();
    let products = new Map();
    if (productSections.length) {
      try {
        selection = await selectProducts(productSections.map((s) => ({ id: s.id, source: s.config.source, limit: s.config.limit })));
        const union = [...new Set([...selection.values()].flat())];
        products = await hydrateProducts(union, { warehouseId });
      } catch (err) {
        logEvent('homepage.resolver.error', { type: 'PRODUCT_BATCH', code: 'PRODUCT_BATCH_FAILED', message: err.message }, 'error');
        for (const s of productSections) outcome.set(s.id, { status: 'ERROR', error: { code: 'PRODUCT_BATCH_FAILED' } });
      }
    }

    // ── resolvers grouped by type, in parallel, isolated ──
    const getCategories = makeCategoryLoader();
    const rdeps = { prisma, store, selection, products, getCategories };
    const byType = new Map();
    for (const s of targets) {
      if (outcome.has(s.id)) continue;
      if (!byType.has(s.section_type)) byType.set(s.section_type, []);
      byType.get(s.section_type).push(s);
    }
    const resolverMs = {};
    await Promise.all([...byType.entries()].map(async ([type, list]) => {
      const t = startTimer();
      const resolver = resolvers[type];
      try {
        if (!resolver) throw Object.assign(new Error(`no resolver for ${type}`), { code: 'NO_RESOLVER' });
        const map = await withTimeout(resolver({ sections: list, plan, deps: rdeps }), list[0].def.timeoutMs, type);
        for (const s of list) {
          const r = map.get(s.id);
          outcome.set(s.id, r ? { status: r.empty ? 'EMPTY' : 'OK', data: r.empty ? null : r.data } : { status: 'EMPTY', data: null });
        }
      } catch (err) {
        const code = err.code === 'RESOLVER_TIMEOUT' ? 'RESOLVER_TIMEOUT' : 'RESOLVER_FAILED';
        logEvent('homepage.resolver.error', { type, code, sections: list.map((s) => s.section_key), message: err.message }, 'error');
        for (const s of list) outcome.set(s.id, { status: 'ERROR', error: { code } });
      } finally {
        resolverMs[type] = t();
      }
    }));

    // ── views ──
    const view = (s) => {
      const o = outcome.get(s.id);
      const base = {
        id: s.id, key: s.section_key, type: s.section_type, title: s.section_name, order: s.position, load: s.load, config: s.config,
        // TEMPORARY compatibility bridge: shipped renderers dispatch on the legacy component_name. Remove with component_name (Phase 12).
        legacy: { componentName: s.component_name ?? null },
      };
      if (!o) return { ...base, status: 'DEFERRED', data: null }; // feed mode only: not in target set
      return { ...base, status: o.status, data: o.data ?? null, ...(o.error ? { error: o.error } : {}) };
    };
    const sections = keys
      ? [...targets.map(view), ...gone.map((key) => ({ key, status: 'GONE', data: null }))]
      : ordered.map(view);

    // ── availability overlay (per request, never cached; failure never fails the feed) ──
    let availabilityApplied = false;
    if (pincode && applyAvailability && store.products.size > 0) {
      try {
        await applyAvailability(store.products, pincode);
        availabilityApplied = true;
      } catch (err) {
        logEvent('homepage.availability.error', { message: err.message }, 'warn');
      }
    }

    const response = {
      version: FEED_VERSION,
      generatedAt: now().toISOString(),
      sections,
      entities: store.toJSON(),
    };

    logEvent(keys ? 'homepage.sections' : 'homepage.feed', {
      platform, warehouseId, durationMs: elapsed(), sectionCount: ordered.length,
      resolved: targets.length, errorSectionCount: sections.filter((s) => s.status === 'ERROR').length,
      productCount: store.products.size, resolverMs, availabilityApplied, hasPincode: !!pincode,
      ...(warnings.length ? { warnings: warnings.length } : {}),
    });
    if (warnings.length) logEvent('homepage.plan.warning', { warnings }, 'warn');

    return response;
  }

  return {
    getFeed: (ctx) => build({ ...ctx, keys: null }),
    getSections: (ctx, keys) => build({ ...ctx, keys }),
  };
}
