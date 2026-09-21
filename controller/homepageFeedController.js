// GET /api/homepage/feed and GET /api/homepage/sections — thin HTTP layer over HomepageFeedService.
// Parsing/validation lives in services/homepage/requestContext.js; all logic lives in services/homepage.

import { homepageFeedService } from '../services/homepage/index.js';
import { feedEnabled, parseContext, parseKeys, cacheControlFor } from '../services/homepage/requestContext.js';
import { logEvent } from '../services/homepage/observability.js';

const bad = (res, message) =>
  res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message } });

const send = (res, body, pincode) => {
  res.set('X-Homepage-Generated-At', body.generatedAt);
  res.set('Vary', 'x-user-pincode');
  // Shared responses are edge-cacheable only when they carry no per-request availability.
  res.set('Cache-Control', cacheControlFor(pincode));
  return res.status(200).json(body);
};

export async function getHomepageFeed(req, res) {
  if (!feedEnabled()) return res.status(404).json({ success: false, error: { code: 'FEED_DISABLED' } });
  const { error, ctx } = parseContext(req);
  if (error) return bad(res, error);
  try {
    return send(res, await homepageFeedService.getFeed(ctx), ctx.pincode);
  } catch (err) {
    logEvent('homepage.feed.error', { message: err.message }, 'error');
    return res.status(503).json({ success: false, error: { code: 'FEED_UNAVAILABLE' } });
  }
}

export async function getHomepageSections(req, res) {
  if (!feedEnabled()) return res.status(404).json({ success: false, error: { code: 'FEED_DISABLED' } });
  const { error, ctx } = parseContext(req);
  if (error) return bad(res, error);
  const parsed = parseKeys(req);
  if (parsed.error) return bad(res, parsed.error);
  try {
    return send(res, await homepageFeedService.getSections(ctx, parsed.keys), ctx.pincode);
  } catch (err) {
    logEvent('homepage.sections.error', { message: err.message }, 'error');
    return res.status(503).json({ success: false, error: { code: 'FEED_UNAVAILABLE' } });
  }
}
