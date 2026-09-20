-- Phase 2 (Marketing Controls): granular acquisition/withdrawal toggles, additive-only.
ALTER TABLE "public"."referral_configs"
  ADD COLUMN "new_referral_signups_enabled" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "public"."affiliate_configs"
  ADD COLUMN "new_applications_enabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "new_links_enabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "withdrawal_enabled" BOOLEAN NOT NULL DEFAULT true;
