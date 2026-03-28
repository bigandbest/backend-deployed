/**
 * SMS Provider factory.
 * Switch between providers by setting SMS_PROVIDER in .env:
 *   SMS_PROVIDER=fast2sms   → Fast2SMS (default)
 *   SMS_PROVIDER=messagebot → MessageBot
 */

import * as fast2sms  from './fast2smsProvider.js';
import * as messagebot from './messageBotProvider.js';

const provider = (process.env.SMS_PROVIDER || 'fast2sms').toLowerCase();

let selected;
if (provider === 'messagebot') {
  selected = messagebot;
  console.log('[SMS] Provider: MessageBot');
} else if (provider === 'fast2sms') {
  selected = fast2sms;
  console.log('[SMS] Provider: Fast2SMS');
} else {
  throw new Error(`Unknown SMS_PROVIDER: "${provider}". Must be "fast2sms" or "messagebot".`);
}

export const sendOTPViaSMS = selected.sendOTPViaSMS;
export const checkDelivery = selected.checkDelivery;
