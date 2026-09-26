// Passive performance instrumentation for the DB-bottleneck investigation (DB_BOTTLENECK_ANALYSIS.md).
//
// OFF by default: nothing is registered and every helper is a pass-through unless PERF_METRICS=1 (or PERF_METRICS_FILE
// is set). It never changes queries, pool size, caching or responses — it only counts and times.
//
//   PERF_METRICS=1                 collect in memory (snapshot() is available to code)
//   PERF_METRICS_FILE=/path.jsonl  also append one JSON snapshot every PERF_METRICS_INTERVAL_MS (default 5000)
//
// What is measured
//   prisma.ops[scope]   Prisma *operations* (findMany, queryRaw, ...) via $use: count, wall time (this INCLUDES time
//                       spent waiting for a pool connection), in-flight now/max. scope = 'availability' | 'other'.
//                       wall-time minus statement time is the closest available proxy for pool wait.
//   prisma.statements   SQL statements from Prisma's 'query' event (duration = engine time). Only emitted when the
//                       client is created with the query log (config/prisma.js does this when NODE_ENV != production),
//                       and the event carries no async context, so statements cannot be attributed to a caller.
//   availability        checkBulkAvailability: requests, items, Redis hits/misses, Prisma operations per request,
//                       wall time, concurrent requests in flight.
//   eventLoop           event-loop delay percentiles (ms) for the interval.
//   routes              per-route attribution (requires the request middleware, see perfRequestMiddleware): requests,
//                       completed vs abandoned (client closed first), HTTP wall time, Prisma operations (count, wall
//                       time, in-flight now/max, by model.action) and operations issued AFTER the client had gone.
//                       SQL statements cannot be attributed to a route (query events carry no async context); measure
//                       statements-per-request per route on an idle server instead and multiply by request counts.

import { AsyncLocalStorage } from 'node:async_hooks';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import fs from 'node:fs';

const ENABLED = /^(1|true|on)$/i.test(process.env.PERF_METRICS || '') || !!process.env.PERF_METRICS_FILE;
export const perfEnabled = ENABLED;

const als = new AsyncLocalStorage();
const BUCKETS = [5, 10, 25, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000]; // ms upper bounds; last slot = overflow

class Hist {
  constructor() { this.reset(); }
  reset() { this.n = 0; this.sum = 0; this.max = 0; this.b = new Array(BUCKETS.length + 1).fill(0); }
  add(v) {
    this.n++; this.sum += v; if (v > this.max) this.max = v;
    let i = 0; while (i < BUCKETS.length && v > BUCKETS[i]) i++;
    this.b[i]++;
  }
  // percentile from bucket upper bounds (coarse by design)
  pct(p) {
    if (!this.n) return null;
    const target = Math.ceil(this.n * p); let acc = 0;
    for (let i = 0; i < this.b.length; i++) { acc += this.b[i]; if (acc >= target) return i < BUCKETS.length ? BUCKETS[i] : this.max; }
    return this.max;
  }
  view() {
    return { n: this.n, avg: this.n ? +(this.sum / this.n).toFixed(1) : null, p50: this.pct(0.5), p95: this.pct(0.95), p99: this.pct(0.99), max: +this.max.toFixed(1) };
  }
}

const newOpScope = () => ({ hist: new Hist(), errors: 0, inFlight: 0, maxInFlight: 0 });
const state = {
  startedAt: Date.now(),
  ops: { availability: newOpScope(), other: newOpScope() },
  totalInFlight: 0, maxTotalInFlight: 0,
  statements: new Hist(),
  caches: new Map(), // name -> { hit, miss, joined }
  items: { owned: 0, joined: 0, batches: 0, batchItems: 0, batchSize: new Hist() },
  lookups: { zone: { hit: 0, miss: 0, joined: 0, failed: 0 }, warehouses: { hit: 0, miss: 0, joined: 0, failed: 0 } },
  avail: { requests: 0, items: 0, cacheHits: 0, cacheMisses: 0, notServiceable: 0, errors: 0, inFlight: 0, maxInFlight: 0, wall: new Hist(), opsPerRequest: new Hist(), opsTotal: 0 },
};
const MAX_ROUTES = 200;
const routes = new Map();
const routeStats = (label) => {
  let r = routes.get(label);
  if (!r) {
    if (routes.size >= MAX_ROUTES) return routeStats('(other routes)');
    r = { requests: 0, completed: 0, abandoned: 0, s2xx: 0, s4xx: 0, s5xx: 0, inFlight: 0, maxInFlight: 0, http: new Hist(),
          ops: 0, opsInFlight: 0, maxOpsInFlight: 0, opWall: new Hist(), opsAfterAbort: 0, byAction: new Map() };
    routes.set(label, r);
  }
  return r;
};
// '/api/orders/123/items/8f2c...-uuid' -> '/api/orders/:id/items/:id'
const normalizePath = (p) => p.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id').replace(/\/\d+(?=\/|$)/g, '/:id');
let loopHist = null;

/** Attach to the shared PrismaClient (call once). No-op when disabled. */
const attached = new WeakSet();
export function attachPrismaMetrics(prisma) {
  if (!ENABLED || attached.has(prisma)) return;
  attached.add(prisma);
  if (typeof prisma.$use === 'function') {
    prisma.$use(async (params, next) => {
      const store = als.getStore();
      const s = state.ops[store && store.scope ? store.scope : 'other'];
      if (store && store.scope) store.ops++;
      s.inFlight++; if (s.inFlight > s.maxInFlight) s.maxInFlight = s.inFlight;
      state.totalInFlight++; if (state.totalInFlight > state.maxTotalInFlight) state.maxTotalInFlight = state.totalInFlight;
      const rs = routeStats(store && store.route ? store.route : '(no request context)');
      rs.ops++; rs.opsInFlight++; if (rs.opsInFlight > rs.maxOpsInFlight) rs.maxOpsInFlight = rs.opsInFlight;
      if (store && store.req && store.req.aborted) rs.opsAfterAbort++;
      const action = `${params.model || 'raw'}.${params.action}`;
      rs.byAction.set(action, (rs.byAction.get(action) || 0) + 1);
      const t0 = process.hrtime.bigint();
      try { return await next(params); }
      catch (e) { s.errors++; throw e; }
      finally {
        const ms = Number(process.hrtime.bigint() - t0) / 1e6;
        s.hist.add(ms); s.inFlight--; state.totalInFlight--;
        rs.opWall.add(ms); rs.opsInFlight--;
      }
    });
  }
  try { prisma.$on('query', (e) => state.statements.add(e.duration)); } catch { /* query events not enabled on this client */ }
}

/**
 * Express middleware: tags the request's async context with a route label so Prisma operations can be attributed to
 * it. Returns null when instrumentation is disabled (caller should then not register anything).
 */
export function perfRequestMiddleware() {
  if (!ENABLED) return null;
  return (req, res, next) => {
    const label = `${req.method} ${normalizePath(req.path || req.url.split('?')[0])}`;
    const rs = routeStats(label);
    const reqState = { aborted: false };
    const store = { scope: null, ops: 0, route: label, req: reqState };
    rs.requests++; rs.inFlight++; if (rs.inFlight > rs.maxInFlight) rs.maxInFlight = rs.inFlight;
    const t0 = process.hrtime.bigint();
    let done = false;
    const end = (finished) => {
      if (done) return; done = true;
      rs.inFlight--; rs.http.add(Number(process.hrtime.bigint() - t0) / 1e6);
      if (finished) { rs.completed++; const c = res.statusCode; if (c >= 500) rs.s5xx++; else if (c >= 400) rs.s4xx++; else rs.s2xx++; }
      else { rs.abandoned++; reqState.aborted = true; }
    };
    res.on('finish', () => end(true));
    res.on('close', () => end(res.writableEnded));
    als.run(store, next);
  };
}

/** Wrap checkBulkAvailability. Pass-through when disabled. */
export function trackAvailability(itemCount, fn) {
  if (!ENABLED) return fn();
  const a = state.avail;
  a.requests++; a.items += itemCount; a.inFlight++; if (a.inFlight > a.maxInFlight) a.maxInFlight = a.inFlight;
  const parent = als.getStore();
  const store = { scope: 'availability', ops: 0, route: parent && parent.route, req: parent && parent.req };
  const t0 = process.hrtime.bigint();
  return als.run(store, async () => {
    try { return await fn(); }
    catch (e) { a.errors++; throw e; }
    finally {
      a.wall.add(Number(process.hrtime.bigint() - t0) / 1e6);
      a.opsPerRequest.add(store.ops); a.opsTotal += store.ops; a.inFlight--;
    }
  });
}
export const availabilityCache = (hits, misses) => { if (ENABLED) { state.avail.cacheHits += hits; state.avail.cacheMisses += misses; } };
/** Generic cache outcome for lib/cacheReadThrough: name, outcome 'hit'|'miss'|'joined'. */
export const cacheEvent = (name, outcome) => {
  if (!ENABLED) return;
  let c = state.caches.get(name); if (!c) { c = { hit: 0, miss: 0, joined: 0 }; state.caches.set(name, c); }
  c[outcome]++;
};
/** Per-item availability: how many misses this request computes itself vs joins from another in-flight request. */
export const availabilityItemFlight = (owned, joined) => { if (ENABLED) { state.items.owned += owned; state.items.joined += joined; } };
/** One batched availability computation of `size` items. */
export const availabilityBatch = (size) => { if (ENABLED) { state.items.batches++; state.items.batchItems += size; state.items.batchSize.add(size); } };
/** Per-pincode lookup outcome: kind 'zone'|'warehouses', outcome 'hit'|'miss'|'joined'|'failed'. */
export const availabilityLookup = (kind, outcome) => { if (ENABLED) state.lookups[kind][outcome]++; };
export const availabilityNotServiceable = () => { if (ENABLED) state.avail.notServiceable++; };

/** @param {boolean} resetInterval  reset max gauges + event-loop histogram (used by the file reporter) */
export function snapshot(resetInterval = false) {
  const opsView = (s) => ({ ...s.hist.view(), errors: s.errors, inFlight: s.inFlight, maxInFlight: s.maxInFlight });
  const a = state.avail;
  const out = {
    ts: new Date().toISOString(),
    uptimeS: Math.round((Date.now() - state.startedAt) / 1000),
    prisma: {
      ops: { availability: opsView(state.ops.availability), other: opsView(state.ops.other) },
      totalInFlight: state.totalInFlight, maxTotalInFlight: state.maxTotalInFlight,
      statements: state.statements.view(),
    },
    caches: Object.fromEntries([...state.caches.entries()].map(([k, v]) => [k, { ...v }])),
    itemFlight: { owned: state.items.owned, joined: state.items.joined, batches: state.items.batches, batchItems: state.items.batchItems },
    lookups: { zone: { ...state.lookups.zone }, warehouses: { ...state.lookups.warehouses } },
    availability: {
      requests: a.requests, items: a.items, cacheHits: a.cacheHits, cacheMisses: a.cacheMisses, notServiceable: a.notServiceable, errors: a.errors,
      inFlight: a.inFlight, maxInFlight: a.maxInFlight, wallMs: a.wall.view(), opsPerRequest: a.opsPerRequest.view(), opsTotal: a.opsTotal,
    },
    eventLoopMs: loopHist ? { p50: +(loopHist.percentile(50) / 1e6).toFixed(1), p99: +(loopHist.percentile(99) / 1e6).toFixed(1), max: +(loopHist.max / 1e6).toFixed(1) } : null,
    memMB: Math.round(process.memoryUsage().rss / 1048576),
    routes: [...routes.entries()].sort((a, b) => b[1].ops - a[1].ops).slice(0, 25).map(([route, r]) => ({
      route, requests: r.requests, completed: r.completed, abandoned: r.abandoned, s2xx: r.s2xx, s4xx: r.s4xx, s5xx: r.s5xx,
      inFlight: r.inFlight, maxInFlight: r.maxInFlight, http: r.http.view(),
      ops: r.ops, opsInFlight: r.opsInFlight, maxOpsInFlight: r.maxOpsInFlight, opWall: r.opWall.view(), opsAfterAbort: r.opsAfterAbort,
      topActions: [...r.byAction.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6),
    })),
  };
  if (resetInterval) {
    for (const s of Object.values(state.ops)) s.maxInFlight = s.inFlight;
    for (const r of routes.values()) { r.maxInFlight = r.inFlight; r.maxOpsInFlight = r.opsInFlight; }
    state.maxTotalInFlight = state.totalInFlight; a.maxInFlight = a.inFlight;
    if (loopHist) loopHist.reset();
  }
  return out;
}

/** Start the JSONL file reporter (only if PERF_METRICS_FILE is set). Timer is unref'd: never keeps the process alive. */
export function startPerfReporter() {
  if (!ENABLED) return;
  console.log('[perf] instrumentation ENABLED', process.env.PERF_METRICS_FILE ? `-> ${process.env.PERF_METRICS_FILE}` : '(in-memory only)');
  loopHist = monitorEventLoopDelay({ resolution: 10 }); loopHist.enable();
  const file = process.env.PERF_METRICS_FILE;
  if (!file) return;
  const every = Math.max(1000, parseInt(process.env.PERF_METRICS_INTERVAL_MS || '5000', 10));
  setInterval(() => { fs.appendFile(file, JSON.stringify(snapshot(true)) + '\n', () => {}); }, every).unref();
}
