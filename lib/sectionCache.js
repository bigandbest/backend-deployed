import redis from '../config/redis.js';

// ── Cache key constants ───────────────────────────────────────────────────────
export const SECTION_CACHE_KEYS = {
  allSections:    'sections:all',
  activeSections: 'sections:active',
  sectionById:    (id) => `sections:meta:${id}`,
  sectionContent: (id, wh) => `section:${id}:wh${wh || 0}`,
  sectionProducts:(id) => `section:${id}:products`,
};

// Invalidate every cache entry tied to a specific section id
export const invalidateSectionCache = async (id) => {
  // Delete scalar meta/list keys
  await Promise.allSettled([
    redis.del(SECTION_CACHE_KEYS.allSections),
    redis.del(SECTION_CACHE_KEYS.activeSections),
    redis.del(SECTION_CACHE_KEYS.sectionById(id)),
  ]);
  // Scan and delete ALL warehouse-variant keys for this section
  // (e.g. section:{id}:wh0, section:{id}:wh3, section:{id}:products:wh0, etc.)
  try {
    let cursor = '0';
    do {
      const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', `section:${id}:*`, 'COUNT', 100);
      cursor = nextCursor;
      if (keys.length) await redis.del(...keys);
    } while (cursor !== '0');
  } catch {
    // Redis unavailable — best effort
  }
};
