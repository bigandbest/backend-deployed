import { getRedisClient } from '../config/redis.js';
import { RedisKeys, RedisTTL } from '../config/redis-keys.js';

// ── Rate limiting ────────────────────────────────────────────────────────────

export async function checkRateLimit(key, maxRequests, windowSeconds) {
  const redis = getRedisClient();
  const current = await redis.incr(key);
  if (current === 1) await redis.expire(key, windowSeconds);
  const ttl = await redis.ttl(key);
  return {
    allowed: current <= maxRequests,
    remaining: Math.max(0, maxRequests - current),
    retryAfter: current <= maxRequests ? 0 : ttl,
  };
}

// ── OTP storage ──────────────────────────────────────────────────────────────

export async function storeOTP(phone, hash, messageId) {
  const redis = getRedisClient();
  await redis.setex(
    RedisKeys.otp(phone),
    RedisTTL.OTP,
    JSON.stringify({ hash, messageId, attempts: 0, createdAt: Date.now() })
  );
}

export async function getOTP(phone) {
  const raw = await getRedisClient().get(RedisKeys.otp(phone));
  return raw ? JSON.parse(raw) : null;
}

export async function incrementOTPAttempts(phone) {
  const redis = getRedisClient();
  const key = RedisKeys.otp(phone);
  const raw = await redis.get(key);
  if (!raw) return 0;
  const data = JSON.parse(raw);
  data.attempts += 1;
  const ttl = await redis.ttl(key);
  await redis.setex(key, ttl > 0 ? ttl : RedisTTL.OTP, JSON.stringify(data));
  return data.attempts;
}

export async function deleteOTP(phone) {
  await getRedisClient().del(RedisKeys.otp(phone));
}

// ── Account lock ─────────────────────────────────────────────────────────────

export async function lockAccount(phone) {
  await getRedisClient().setex(RedisKeys.otpLock(phone), RedisTTL.OTP_LOCK, '1');
}

export async function getAccountLockTTL(phone) {
  const ttl = await getRedisClient().ttl(RedisKeys.otpLock(phone));
  return ttl > 0 ? ttl : 0;
}

// ── JWT blacklist ─────────────────────────────────────────────────────────────

export async function blacklistToken(jti) {
  await getRedisClient().setex(RedisKeys.tokenBlacklist(jti), RedisTTL.TOKEN_BLACKLIST, '1');
}

export async function isTokenBlacklisted(jti) {
  const result = await getRedisClient().get(RedisKeys.tokenBlacklist(jti));
  return result === '1';
}

// ── User cache ────────────────────────────────────────────────────────────────

export async function cacheUser(userId, userData) {
  await getRedisClient().setex(RedisKeys.userCache(userId), RedisTTL.USER_CACHE, JSON.stringify(userData));
}

export async function getCachedUser(userId) {
  const raw = await getRedisClient().get(RedisKeys.userCache(userId));
  return raw ? JSON.parse(raw) : null;
}

export async function invalidateUserCache(userId) {
  await getRedisClient().del(RedisKeys.userCache(userId));
}
