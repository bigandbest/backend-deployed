// Pure request parsing for the homepage endpoints (no IO imports → unit-testable without Prisma/Redis).
import { PLATFORMS, SECTION_KEY_PATTERN } from './registry/index.js';
import { PINCODE_PATTERN } from './AvailabilityOverlay.js';
import { FEED_VERSION } from './HomepageFeedService.js';

export const MAX_KEYS = 8;

// Kill switch (plan §36). Off by default until the Redis layers (Phase 5) are in place.
export const feedEnabled = (env = process.env) => String(env.HOMEPAGE_FEED_ENABLED ?? 'true').toLowerCase() === 'true';

/** @returns {{ error?: string, ctx?: { platform:string, warehouseId:number|null, pincode:string|null } }} */
export function parseContext(req) {
  const { platform, warehouse_id: wh, v } = req.query;
  if (!PLATFORMS.includes(platform)) return { error: `platform must be one of: ${PLATFORMS.join(', ')}` };
  if (v !== undefined && Number(v) !== FEED_VERSION) return { error: `unsupported contract version "${v}"` };

  let warehouseId = null;
  if (wh !== undefined && wh !== '') {
    if (!/^\d{1,9}$/.test(String(wh))) return { error: 'warehouse_id must be a positive integer' };
    warehouseId = parseInt(wh, 10);
  }

  // A malformed pincode header is ignored (never an error): it must not break the homepage.
  const raw = req.headers?.['x-user-pincode'];
  const pincode = typeof raw === 'string' && PINCODE_PATTERN.test(raw) ? raw : null;

  return { ctx: { platform, warehouseId, pincode } };
}

/** @returns {{ error?: string, keys?: string[] }} */
export function parseKeys(req) {
  const keys = String(req.query.keys ?? '').split(',').map((k) => k.trim()).filter(Boolean);
  if (keys.length === 0) return { error: 'keys is required (comma separated section keys)' };
  if (keys.length > MAX_KEYS) return { error: `at most ${MAX_KEYS} keys per request` };
  if (keys.some((k) => !SECTION_KEY_PATTERN.test(k))) return { error: 'invalid section key' };
  return { keys: [...new Set(keys)] };
}

export const cacheControlFor = (pincode) =>
  pincode ? 'private, no-store' : 'public, max-age=0, s-maxage=60, stale-while-revalidate=300';
