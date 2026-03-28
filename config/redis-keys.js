export const RedisKeys = {
  otp:           (phone) => `otp:${phone}`,
  rateLimitSend: (phone) => `ratelimit:send:${phone}`,
  rateLimitIp:   (ip)    => `ratelimit:ip:${ip}`,
  otpLock:       (phone) => `lock:${phone}`,
  tokenBlacklist:(jti)   => `blacklist:token:${jti}`,
  userCache:     (userId)=> `user:${userId}`,
};

export const RedisTTL = {
  OTP:              600,   // 10 minutes
  RATE_LIMIT_SEND:  600,   // 10 minute window
  RATE_LIMIT_IP:    60,    // 1 minute window
  OTP_LOCK:         1800,  // 30 minute lockout
  TOKEN_BLACKLIST:  900,   // 15 minutes (matches access token expiry)
  USER_CACHE:       300,   // 5 minutes
};
