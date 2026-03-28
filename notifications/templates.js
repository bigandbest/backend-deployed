export const NotificationTemplates = {
  OTP_SENT: (last4) => ({
    title: 'OTP Sent',
    body: `An OTP has been sent to your number ending in ${last4}`,
    data: { type: 'otp_sent' },
    channelId: 'auth',
  }),

  NEW_LOGIN: (device) => ({
    title: 'New Login Detected',
    body: `Your account was accessed from ${device || 'a new device'}`,
    data: { type: 'new_login' },
    channelId: 'security',
  }),

  SESSION_EXPIRED: () => ({
    title: 'Session Expired',
    body: 'Please log in again to continue',
    data: { type: 'session_expired' },
    channelId: 'auth',
  }),
};
