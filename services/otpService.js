import crypto from 'crypto';
import { sendOTPViaSMS } from '../utils/smsProvider.js';
import {
  storeOTP, getOTP, incrementOTPAttempts, deleteOTP,
  lockAccount, getAccountLockTTL, checkRateLimit,
} from '../utils/redisHelpers.js';
import { RedisKeys, RedisTTL } from '../config/redis-keys.js';

const OTP_SALT         = process.env.OTP_SALT         || 'default-salt-change-me';
const OTP_MAX_ATTEMPTS = parseInt(process.env.OTP_MAX_ATTEMPTS   || '5');
const RATE_LIMIT_COUNT = parseInt(process.env.OTP_RATE_LIMIT_COUNT || '3');
const RATE_LIMIT_WIN   = parseInt(process.env.OTP_RATE_LIMIT_WINDOW || '600');

/** 6-digit cryptographically secure OTP */
function generateOTP() {
  return crypto.randomInt(100000, 999999).toString();
}

/** SHA-256 hash with salt — never store plain OTP */
function hashOTP(otp) {
  return crypto.createHash('sha256').update(otp + OTP_SALT).digest('hex');
}

/**
 * Send OTP to a phone number.
 * @param {string} phone - Already normalized (91XXXXXXXXXX)
 * @returns {{ referenceId: string }}
 * @throws AppError on rate limit / lock / send failure
 */
export async function sendOTP(phone) {
  // 1. Account lock check
  const lockTTL = await getAccountLockTTL(phone);
  if (lockTTL > 0) {
    const err = new Error('Too many attempts. Try again later.');
    err.statusCode = 429;
    err.code = 'TOO_MANY_ATTEMPTS';
    err.retryAfter = lockTTL;
    throw err;
  }

  // 2. Send rate limit (3 per 10 min per phone)
  const limit = await checkRateLimit(RedisKeys.rateLimitSend(phone), RATE_LIMIT_COUNT, RATE_LIMIT_WIN);
  if (!limit.allowed) {
    const err = new Error('Too many OTP requests. Please wait before trying again.');
    err.statusCode = 429;
    err.code = 'RATE_LIMITED';
    err.retryAfter = limit.retryAfter;
    throw err;
  }

  // 3. Generate OTP and reference
  const otp = generateOTP();
  const referenceId = `txn_${crypto.randomUUID()}`;

  // 4. Send via MessageBot
  const result = await sendOTPViaSMS(phone, otp, referenceId);
  if (!result.success) {
    const err = new Error('Failed to send OTP. Please try again.');
    err.statusCode = 500;
    err.code = 'SMS_FAILED';
    throw err;
  }

  // 5. Store hash (never plain OTP)
  await storeOTP(phone, hashOTP(otp), result.messageId);

  return { referenceId };
}

/**
 * Verify an OTP for a phone number.
 * @returns {'valid' | 'invalid' | 'expired' | 'locked'}
 */
export async function verifyOTP(phone, inputOtp) {
  // 1. Lock check
  const lockTTL = await getAccountLockTTL(phone);
  if (lockTTL > 0) return 'locked';

  // 2. Get record
  const record = await getOTP(phone);
  if (!record) return 'expired';

  // 3. Compare hash
  if (hashOTP(inputOtp) !== record.hash) {
    const attempts = await incrementOTPAttempts(phone);
    if (attempts >= OTP_MAX_ATTEMPTS) {
      await lockAccount(phone);
      await deleteOTP(phone);
    }
    return 'invalid';
  }

  // 4. Valid — clean up
  await deleteOTP(phone);
  return 'valid';
}
