export const BANNER_CACHE_TTL = parseInt(process.env.BANNER_CACHE_TTL || '300', 10);

export const BANNER_CACHE_KEYS = {
  byType: (type) => `banner:type:${type}`,
};
