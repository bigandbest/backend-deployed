import axios from 'axios';

const API_URL   = process.env.MESSAGEBOT_API_URL  || 'http://papi.messagebot.in/SendSmsV2';
const DLR_URL   = process.env.MESSAGEBOT_DLR_URL  || 'http://papi.messagebot.in/Dlr/GetDetails';
const API_TOKEN = process.env.MESSAGEBOT_API_TOKEN;
const SENDER_ID = process.env.MESSAGEBOT_SENDER_ID || 'OTPBOT';
const DLT_ENTITY_ID       = process.env.MESSAGEBOT_DLT_ENTITY_ID;
const DLT_TEMPLATE_ID     = process.env.MESSAGEBOT_DLT_TEMPLATE_ID;
const SENDER_NAME         = process.env.SENDER_NAME || 'BigBastMart';

/** Mask phone for safe logging: 919876543210 → 91****3210 */
function maskPhone(phone) {
  return phone.slice(0, 2) + '****' + phone.slice(-4);
}

/** Normalize to 91XXXXXXXXXX — no + prefix */
function normalizePhone(phone) {
  let p = phone.toString().replace(/[\s\-\+]/g, '');
  if (p.startsWith('91') && p.length === 12) return p;
  if (p.length === 10) return '91' + p;
  throw new Error(`Invalid phone number: ${p}`);
}

async function doSend(payload) {
  const res = await axios.post(API_URL, payload, {
    headers: { 'Content-Type': 'application/json' },
    timeout: 5000,
  });
  return res.data;
}

/**
 * Send OTP via MessageBot
 * @returns {{ success: boolean, messageId?: number, error?: string }}
 */
export async function sendOTPViaSMS(phone, otp, referenceId) {
  const destination = normalizePhone(phone);
  const messageText = `Your OTP is ${otp}. Valid for 10 minutes. Do not share with anyone. - ${SENDER_NAME}`;

  const payload = {
    apiToken:              API_TOKEN,
    messageType:           '3',          // OTP route — mandatory
    messageEncoding:       '1',
    destinationAddress:    destination,
    sourceAddress:         SENDER_ID,
    messageText,
    dltEntityId:           DLT_ENTITY_ID,
    dltEntityTemplateId:   DLT_TEMPLATE_ID,
    userReferenceId:       referenceId,
  };

  let data;
  try {
    data = await doSend(payload);
  } catch (err) {
    // Retry once after 2 seconds
    console.warn('[MessageBot] Send failed, retrying once...', err.message);
    await new Promise(r => setTimeout(r, 2000));
    try {
      data = await doSend(payload);
    } catch (retryErr) {
      console.error('[MessageBot] Retry failed:', retryErr.message);
      return { success: false, error: retryErr.message };
    }
  }

  if (data?.OperationCode !== 0) {
    console.error('[MessageBot] Non-zero OperationCode:', data);
    return { success: false, error: data?.Remarks || 'Send failed' };
  }

  console.log(`[MessageBot] Sent to ${maskPhone(destination)} | MessageId: ${data.MessageId} | Ref: ${referenceId}`);
  return { success: true, messageId: data.MessageId };
}

/**
 * Check delivery status for a MessageId
 * @returns {{ status: 'Delivered' | 'Failed' | 'Pending' }}
 */
export async function checkDelivery(messageId) {
  try {
    const res = await axios.get(DLR_URL, {
      params: { apiToken: API_TOKEN, messageId },
      timeout: 5000,
    });
    const dlrStatus = res.data?.DlrStatus || 'Pending';
    return { status: dlrStatus };
  } catch (err) {
    console.error('[MessageBot] DLR check failed:', err.message);
    return { status: 'Pending' };
  }
}
