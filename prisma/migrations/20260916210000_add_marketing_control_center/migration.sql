-- Phase 9 (Marketing Control Center): affiliate fraud parity + notification templates.

-- Shared fraud-log table gains a program discriminator (Q2) plus the review/status columns the
-- admin review flow (reviewFraudLog + the FraudLogs admin page) already expected but never
-- actually existed on this table — every review attempt was throwing a Prisma validation error.
ALTER TABLE "public"."referral_fraud_logs"
  ADD COLUMN "program" VARCHAR(20) NOT NULL DEFAULT 'REFERRAL',
  ADD COLUMN "status" VARCHAR(30) NOT NULL DEFAULT 'PENDING_REVIEW',
  ADD COLUMN "reviewed_by" UUID,
  ADD COLUMN "reviewed_at" TIMESTAMPTZ,
  ADD COLUMN "review_notes" TEXT,
  ADD COLUMN "action_taken" VARCHAR(100),
  ADD COLUMN "action_taken_by" UUID,
  ADD COLUMN "action_taken_at" TIMESTAMPTZ;

CREATE TABLE "public"."notification_templates" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "notification_type" VARCHAR(100) NOT NULL,
  "title_template" TEXT NOT NULL,
  "message_template" TEXT NOT NULL,
  "supported_variables" JSONB NOT NULL DEFAULT '[]',
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "notification_templates_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "notification_templates_notification_type_key" UNIQUE ("notification_type")
);
