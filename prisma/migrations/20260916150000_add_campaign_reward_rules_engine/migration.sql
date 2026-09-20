-- Phase 5 (Campaign + Reward Rules Engine). Replaces the dead referral_campaigns stub with a
-- unified campaigns/campaign_rules/campaign_usage model shared by referral and affiliate.

CREATE TABLE "public"."campaigns" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" VARCHAR(255) NOT NULL,
  "description" TEXT,
  "channel" VARCHAR(20) NOT NULL,
  "starts_at" TIMESTAMPTZ NOT NULL,
  "ends_at" TIMESTAMPTZ NOT NULL,
  "usage_limit" INTEGER,
  "used_count" INTEGER NOT NULL DEFAULT 0,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_by" UUID,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "campaigns_channel_is_active_starts_at_ends_at_idx"
  ON "public"."campaigns"("channel", "is_active", "starts_at", "ends_at");

CREATE TABLE "public"."campaign_rules" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "campaign_id" UUID NOT NULL,
  "scope_type" VARCHAR(20) NOT NULL,
  "scope_id" UUID,
  "reward_type" VARCHAR(20) NOT NULL,
  "reward_value" DECIMAL(10,2) NOT NULL,
  "max_reward_cap" DECIMAL(10,2),
  "min_order_value" DECIMAL(10,2),
  CONSTRAINT "campaign_rules_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "campaign_rules_campaign_id_key" UNIQUE ("campaign_id"),
  CONSTRAINT "campaign_rules_campaign_id_fkey" FOREIGN KEY ("campaign_id")
    REFERENCES "public"."campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "campaign_rules_scope_type_scope_id_idx"
  ON "public"."campaign_rules"("scope_type", "scope_id");

CREATE TABLE "public"."campaign_usage" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "campaign_id" UUID NOT NULL,
  "order_id" UUID NOT NULL,
  "channel" VARCHAR(20) NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "campaign_usage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "campaign_usage_campaign_id_order_id_key" UNIQUE ("campaign_id", "order_id"),
  CONSTRAINT "campaign_usage_campaign_id_fkey" FOREIGN KEY ("campaign_id")
    REFERENCES "public"."campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Financial snapshot columns (Q10/Q16) — nullable, additive only.
ALTER TABLE "public"."referral_transactions"
  ADD COLUMN "campaign_id" UUID,
  ADD COLUMN "campaign_name" VARCHAR(255),
  ADD COLUMN "applied_reward_type" VARCHAR(20),
  ADD COLUMN "applied_reward_value" DECIMAL(10,2);

ALTER TABLE "public"."referral_transactions"
  ADD CONSTRAINT "referral_transactions_campaign_id_fkey" FOREIGN KEY ("campaign_id")
    REFERENCES "public"."campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."affiliate_orders"
  ADD COLUMN "campaign_id" UUID,
  ADD COLUMN "campaign_name" VARCHAR(255),
  ADD COLUMN "campaign_breakdown" JSONB;

ALTER TABLE "public"."affiliate_orders"
  ADD CONSTRAINT "affiliate_orders_campaign_id_fkey" FOREIGN KEY ("campaign_id")
    REFERENCES "public"."campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."affiliate_commissions"
  ADD COLUMN "campaign_id" UUID,
  ADD COLUMN "campaign_name" VARCHAR(255),
  ADD COLUMN "campaign_breakdown" JSONB;

ALTER TABLE "public"."affiliate_commissions"
  ADD CONSTRAINT "affiliate_commissions_campaign_id_fkey" FOREIGN KEY ("campaign_id")
    REFERENCES "public"."campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Drop the dead referral_campaigns stub (Q6) — no code references it after this phase.
DROP TABLE IF EXISTS "public"."referral_campaigns";
