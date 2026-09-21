// Route-level invalidation hook: after a SUCCESSFUL non-GET request, emit a homepage cache event.
// Mounted in server.js so no controller needs to change and no write path can forget to invalidate.
import { homepageInvalidator } from '../services/homepage/index.js';

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/**
 * @param {string} event  e.g. 'BANNER_UPDATED'
 * @param {{ idFrom?: 'section'|'product', pathMatches?: RegExp }} [opts]
 *   idFrom 'section' -> first numeric path segment is the section id; 'product' -> first uuid in the path.
 *   pathMatches      -> only emit when the mounted-relative path matches (for broad mounts like /api/admin).
 */
export const invalidateHomepageOnWrite = (event, { idFrom, pathMatches } = {}) => (req, res, next) => {
  if (!WRITE_METHODS.has(req.method) || (pathMatches && !pathMatches.test(req.path))) return next();
  res.on('finish', () => {
    if (res.statusCode < 200 || res.statusCode >= 300) return;
    const payload = {};
    if (idFrom === 'section') payload.sectionId = req.path.split('/').filter(Boolean)[0];
    if (idFrom === 'product') payload.productId = req.path.match(UUID)?.[0];
    homepageInvalidator.emit(event, payload).catch(() => {});
  });
  next();
};
