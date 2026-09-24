// Router-level guard: every non-read request must come from an authenticated ADMIN, using the same
// authenticateToken + requireAdmin pair as /api/product-sections. Reads (GET/HEAD/OPTIONS) stay public because the
// storefront and the mobile app consume them. Use as the first `router.use(...)` of a config-writing router so a
// route added later cannot forget to be protected.
import { authenticateToken } from './authenticate.js';
import { requireAdmin } from './authorize.js';

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export const adminWritesOnly = (req, res, next) => {
  if (READ_METHODS.has(req.method)) return next();
  return authenticateToken(req, res, (err) => (err ? next(err) : requireAdmin(req, res, next)));
};
