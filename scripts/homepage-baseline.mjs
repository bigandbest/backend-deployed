#!/usr/bin/env node
// Phase 0 baseline / regression harness for the homepage endpoints (plan §37.1).
//
//   node scripts/homepage-baseline.mjs --base http://localhost:8000/api [--runs 50] [--pincode 560001] [--out docs/homepage-baseline.json]
//
// Measures, over the SAME workload before and after the migration:
//   - latency P50/P95/max per endpoint (client-observed, includes network)
//   - raw + gzip response bytes
//   - legacy /homepage/bootstrap: section count, product objects sent vs UNIQUE products (duplication ratio),
//     and how much of the payload is `section_products` / `preview_products` / `subcategory_mappings` (unused by clients)
//   - feed: section count by status, unique products, feed_age (now - generatedAt)
//   - admin_state_mismatch: keys in /product-sections/active that are missing from the feed (and vice-versa)
// It does NOT measure browser/mobile request counts or DB query counts — capture those with a HAR / proxy trace and
// Prisma's $on('query') (see test workflow in the plan). Output is a JSON file to commit as the frozen baseline.

import { gzipSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, arr) => (a.startsWith('--') ? [...acc, [a.slice(2), arr[i + 1]?.startsWith('--') || arr[i + 1] === undefined ? true : arr[i + 1]]] : acc), []));
const BASE = String(args.base || 'http://localhost:8000/api').replace(/\/$/, '');
const RUNS = parseInt(args.runs || '30', 10);
const PINCODE = args.pincode && args.pincode !== true ? String(args.pincode) : null;
const OUT = args.out && args.out !== true ? String(args.out) : null;

const pct = (arr, p) => { const s = [...arr].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)] : null; };

async function hit(path, headers = {}) {
  const t = performance.now();
  const res = await fetch(BASE + path, { headers });
  const buf = Buffer.from(await res.arrayBuffer());
  return { ms: performance.now() - t, status: res.status, raw: buf.length, gzip: gzipSync(buf).length, body: buf.toString('utf8'), headers: res.headers };
}

async function bench(name, path, headers) {
  const times = []; let last; let errors = 0;
  for (let i = 0; i < RUNS; i++) {
    try { last = await hit(path, headers); if (last.status !== 200) errors++; times.push(last.ms); } catch { errors++; }
  }
  return {
    name, path, runs: RUNS, errors,
    p50Ms: +pct(times, 50)?.toFixed(1), p95Ms: +pct(times, 95)?.toFixed(1), maxMs: +Math.max(...times).toFixed(1),
    rawBytes: last?.raw, gzipBytes: last?.gzip, _last: last,
  };
}

const strip = ({ _last, ...rest }) => rest;
const out = { measuredAt: new Date().toISOString(), base: BASE, runs: RUNS, pincode: !!PINCODE, provenance: 'MEASURED', endpoints: {}, analysis: {} };
const pinHeaders = PINCODE ? { 'x-user-pincode': PINCODE } : {};

// ── legacy bootstrap ──
const boot = await bench('bootstrap', '/homepage/bootstrap', pinHeaders);
out.endpoints.bootstrap = strip(boot);
try {
  const b = JSON.parse(boot._last.body);
  const seen = new Map(); let productObjects = 0; let sectionProducts = 0; let previewProducts = 0;
  const count = (p) => { if (p?.id && p.variants !== undefined) { productObjects++; seen.set(p.id, (seen.get(p.id) || 0) + 1); } };
  const bytes = (o) => Buffer.byteLength(JSON.stringify(o ?? null));
  let bytesSectionProducts = 0; let bytesPreview = 0; let bytesSubcatMappings = 0;
  for (const c of Object.values(b.sectionContent || {})) {
    (c.products || []).forEach(count);
    for (const g of c.groups || []) (g.preview_products || []).forEach((p) => { count(p); previewProducts++; });
    sectionProducts += (c.section_products || []).length;
    bytesSectionProducts += bytes(c.section_products); bytesPreview += (c.groups || []).reduce((a, g) => a + bytes(g.preview_products), 0); bytesSubcatMappings += bytes(c.subcategory_mappings);
  }
  const total = Buffer.byteLength(boot._last.body);
  out.analysis.bootstrap = {
    activeSections: (b.sections || []).length, sectionsWithContent: Object.keys(b.sectionContent || {}).length,
    productObjectsSent: productObjects, uniqueProducts: seen.size,
    duplicateProductObjects: productObjects - seen.size, duplicationRatio: seen.size ? +(productObjects / seen.size).toFixed(2) : null,
    sectionProductsRows: sectionProducts, previewProductObjects: previewProducts,
    unusedPayloadBytes: { section_products: bytesSectionProducts, groups_preview_products: bytesPreview, subcategory_mappings: bytesSubcatMappings },
    unusedPayloadShare: +(((bytesSectionProducts + bytesPreview + bytesSubcatMappings) / total)).toFixed(3),
  };
} catch (e) { out.analysis.bootstrap = { error: e.message }; }

// ── v2 feed ──
for (const platform of ['web', 'mobile']) {
  const r = await bench(`feed:${platform}`, `/homepage/feed?platform=${platform}`, pinHeaders);
  out.endpoints[`feed_${platform}`] = strip(r);
  if (r._last?.status === 200) {
    const f = JSON.parse(r._last.body);
    const byStatus = f.sections.reduce((a, s) => ((a[s.status] = (a[s.status] || 0) + 1), a), {});
    let refs = 0; for (const s of f.sections) refs += s.data?.productIds?.length || 0;
    const uniq = Object.keys(f.entities.products).length;
    out.analysis[`feed_${platform}`] = {
      sections: f.sections.length, byStatus, productReferences: refs, uniqueProducts: uniq, duplicateProductObjects: 0,
      feedAgeMsAtReceipt: Date.now() - new Date(f.generatedAt).getTime(),
    };
    if (platform === 'web') {
      const deferred = f.sections.filter((s) => s.status === 'DEFERRED').map((s) => s.key);
      for (let i = 0; i < deferred.length; i += 8) {
        const keys = deferred.slice(i, i + 8);
        const d = await bench(`sections:${i / 8 + 1}`, `/homepage/sections?platform=web&keys=${keys.join(',')}`, pinHeaders);
        out.endpoints[`sections_batch_${i / 8 + 1}`] = { ...strip(d), keys: keys.length };
      }
      out.analysis.deferredRequests = Math.ceil(deferred.length / 8);
    }
    // admin_state_mismatch: active sections (legacy list) that the feed does not deliver, and vice-versa
    try {
      const act = JSON.parse((await hit('/product-sections/active')).body).data || [];
      const legacyKeys = new Set(act.map((s) => s.section_key));
      const feedKeys = new Set(f.sections.map((s) => s.key));
      out.analysis[`admin_state_${platform}`] = {
        activeInDbNotInFeed: [...legacyKeys].filter((k) => !feedKeys.has(k)),
        inFeedNotActiveInDb: [...feedKeys].filter((k) => !legacyKeys.has(k)),
      };
    } catch { /* legacy list unavailable */ }
  } else {
    out.analysis[`feed_${platform}`] = { error: `HTTP ${r._last?.status ?? 'no response'} (is HOMEPAGE_FEED_ENABLED=true?)` };
  }
}

const table = Object.entries(out.endpoints).map(([k, v]) => `${k.padEnd(22)} p50 ${String(v.p50Ms).padStart(7)}ms  p95 ${String(v.p95Ms).padStart(7)}ms  ${String(v.gzipBytes).padStart(8)} B gzip  ${String(v.rawBytes).padStart(9)} B raw  errors ${v.errors}`).join('\n');
console.log(table);
console.log(JSON.stringify(out.analysis, null, 2));
if (OUT) { mkdirSync(dirname(OUT), { recursive: true }); writeFileSync(OUT, JSON.stringify(out, null, 2)); console.log(`\nwrote ${OUT}`); }
