import { test, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
let profile, membership, enrollments;
const prisma = {
  user_referral_profiles: { findUnique: async () => profile },
  referral_configs: { findFirst: async () => null },
};
mock.module('../../config/prisma.js', { defaultExport: prisma });
mock.module('../../services/referralService.js', { namedExports: {
  getOrCreateReferralProfile: async () => profile,
  getConfig: async () => ({ program_name: 'Refer & Earn', referee_reward_amount: 25, referrer_reward_amount: 75, return_window_days: 7 }),
} });
mock.module('../../services/membershipService.js', { namedExports: {
  ensureMembership: async () => { if (!membership) { enrollments++; membership = { status: 'TRIAL', referrals_counted: 0, referral_target: 3 }; } return membership; },
  getMembershipSummary: async () => membership,
} });
const { getProfile, generateCode, getShareContent } = await import('../../controller/referralController.js');
const req = { user: { id: 'user1', name: 'Customer' } };
const res = () => ({ statusCode: 200, body: null, json(body) { this.body = body; return this; }, status(code) { this.statusCode = code; return this; } });
beforeEach(() => { profile = { referral_code: 'CODE1234' }; membership = null; enrollments = 0; });
test('reading an existing code never enrolls, explicit activation enrolls once and returns progress', async () => {
  const read = res(); await getProfile(req, read);
  assert.equal(read.body.membership, null); assert.equal(enrollments, 0);
  const activated = res(); await generateCode(req, activated); await generateCode(req, res());
  assert.equal(enrollments, 1); assert.equal(activated.body.membership.status, 'TRIAL');
  assert.equal(activated.body.membership.referral_target, 3);
});
test('blocked profiles cannot start a trial', async () => {
  profile.is_blocked = true; const response = res(); await generateCode(req, response);
  assert.equal(response.statusCode, 403); assert.equal(enrollments, 0);
});
test('shared invitation contains a usable link and conditional reward language', async () => {
  const response = res(); await getShareContent(req, response);
  const share = response.body.share;
  assert.match(new URL(share.invitation_url).pathname, /\/ref\/CODE1234$/);
  assert.ok(share.message.includes(share.invitation_url));
  assert.match(share.message, /return window/); assert.match(share.message, /₹25/);
  assert.equal(enrollments, 0);
});
