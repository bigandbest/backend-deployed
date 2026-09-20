-- Growth Program (referral/affiliate) idempotency constraints — Phase 0.
-- Verified against production (read-only) on 2026-09-15: zero existing rows violate any of these.
-- Applied to dev (nwznoveitnogzgqewhoz) directly on 2026-09-15. Still needs to run against prod:
--   npx prisma migrate deploy   (or run this file's SQL directly against prod, then mark it resolved)

ALTER TABLE affiliate_orders
  ADD CONSTRAINT affiliate_orders_order_id_key UNIQUE (order_id);

ALTER TABLE affiliate_commissions
  ADD CONSTRAINT affiliate_commissions_affiliate_order_id_key UNIQUE (affiliate_order_id);

ALTER TABLE referral_rewards
  ADD CONSTRAINT referral_rewards_referral_transaction_id_reward_type_key UNIQUE (referral_transaction_id, reward_type);
