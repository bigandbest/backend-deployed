import axios from 'axios';

const API_URL    = 'https://www.fast2sms.com/dev/bulkV2';
const API_KEY    = process.env.FAST2SMS_API_KEY;

/** Mask phone for safe logging: 9876543210 → ****3210 */
function maskPhone(phone) {
  return '****' + phone.slice(-4);
}

/** Strip country code — Fast2SMS needs exactly 10 digits, no prefix */
function normalizePhone(phone) {
  let p = phone.toString().replace(/[\s\-\+]/g, '').replace(/\D/g, '');
  if (p.startsWith('91') && p.length === 12) p = p.slice(2);
  if (p.length !== 10) throw new Error(`Invalid phone after normalization: ${p.length} digits`);
  return p;
}

async function doSend(normalized, otp) {
  const res = await axios.post(
    API_URL,
    { variables_values: otp, route: 'otp', numbers: normalized },
    {
      headers: {
        authorization: API_KEY,
        'content-type': 'application/json',
        'cache-control': 'no-cache',
      },
      timeout: 5000,
    }
  );
  return res.data;
}

/**
 * Send OTP via Fast2SMS
 * @returns {{ success: boolean, messageId?: number, error?: string }}
 */
export async function sendOTPViaSMS(phone, otp, referenceId) {
  let normalized;
  try {
    normalized = normalizePhone(phone);
  } catch (e) {
    return { success: false, error: e.message };
  }

  let data;
  try {
    data = await doSend(normalized, otp);
  } catch (err) {
    // Retry once on network error
    if (err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT' || err.code === 'ECONNREFUSED') {
      console.warn('[Fast2SMS] Network error, retrying once...', err.message);
      await new Promise(r => setTimeout(r, 2000));
      try {
        data = await doSend(normalized, otp);
      } catch (retryErr) {
        console.error('[Fast2SMS] Retry failed:', retryErr.message);
        return { success: false, error: retryErr.message };
      }
    } else {
      console.error('[Fast2SMS] Exception:', err.message);
      return { success: false, error: err.message };
    }
  }

  if (data?.return !== true) {
    const errMsg = Array.isArray(data?.message) ? data.message.join(', ') : String(data?.message);
    console.error('[Fast2SMS] Send failed:', errMsg);
    return { success: false, error: errMsg };
  }

  // Derive a numeric messageId from request_id for Redis compatibility
  const messageId = parseInt((data.request_id || '').replace(/\D/g, '').slice(0, 10) || '0', 10);
  console.log(`[Fast2SMS] Sent to ${maskPhone(normalized)} | request_id: ${data.request_id}`);
  return { success: true, messageId };
}

/**
 * Fast2SMS has no public DLR polling on standard plans.
 * Returns Pending always — request_id is stored in Redis for reference.
 */
export async function checkDelivery(_messageId) {
  return { status: 'Pending' };
}
