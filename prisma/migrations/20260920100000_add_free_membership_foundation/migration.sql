-- Free membership foundation (Release 1): plans, per-user membership, qualification credits, status log.
-- Paid membership (membership_payments, Razorpay, refunds, GST) is deliberately NOT part of this migration.
--
-- BEFORE running against any database with real data, this must return ZERO rows (the unique index below would fail):
--   SELECT referee_id, count(*) FROM referral_transactions GROUP BY referee_id HAVING count(*) > 1;
-- (A parallel apply-code race that existed before this release could have created duplicates; resolve them first.)
--
-- Applied to dev (nwznoveitnogzgqewhoz) on 2026-09-20. Still needs to run against prod.

-- One referrer per referee: final integrity guarantee under the application-level atomic apply-code path.
ALTER TABLE referral_transactions
  ADD CONSTRAINT referral_transactions_referee_id_key UNIQUE (referee_id);

-- Was the referrer allowed to earn when the referred order was placed? Existing rows default to true.
ALTER TABLE referral_transactions
  ADD COLUMN membership_eligible BOOLEAN NOT NULL DEFAULT TRUE;

CREATE TABLE membership_plans (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code                  VARCHAR(50)  NOT NULL,
  name                  VARCHAR(255) NOT NULL,
  trial_duration_days   INTEGER      NOT NULL CHECK (trial_duration_days > 0),
  trial_referral_target INTEGER      NOT NULL CHECK (trial_referral_target > 0),
  count_basis           VARCHAR(20)  NOT NULL DEFAULT 'FIRST_ORDER' CHECK (count_basis IN ('REGISTRATION', 'FIRST_ORDER')),
  price                 DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (price >= 0),
  billing_cycle         VARCHAR(20)  NOT NULL DEFAULT 'ONE_TIME' CHECK (billing_cycle IN ('ONE_TIME', 'MONTHLY', 'YEARLY')),
  grace_period_days     INTEGER      NOT NULL DEFAULT 0 CHECK (grace_period_days >= 0),
  is_active             BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT membership_plans_code_key UNIQUE (code)
);

CREATE TABLE user_memberships (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID        NOT NULL,
  plan_id           UUID        NOT NULL REFERENCES membership_plans(id),
  status            VARCHAR(20) NOT NULL DEFAULT 'TRIAL' CHECK (status IN ('TRIAL', 'ACTIVE', 'LAPSED', 'ACTIVE_PAID', 'CANCELLED')),
  trial_started_at  TIMESTAMPTZ NOT NULL,
  trial_ends_at     TIMESTAMPTZ NOT NULL,
  referrals_counted INTEGER     NOT NULL DEFAULT 0 CHECK (referrals_counted >= 0),
  qualified_at      TIMESTAMPTZ,
  lapsed_at         TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT user_memberships_user_id_key UNIQUE (user_id)
);
CREATE INDEX user_memberships_status_trial_ends_at_idx ON user_memberships (status, trial_ends_at);

-- A referred user contributes to a membership at most once (replay/retry/multi-rule safe).
CREATE TABLE membership_referral_credits (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  membership_id           UUID        NOT NULL REFERENCES user_memberships(id),
  referee_id              UUID        NOT NULL,
  referral_transaction_id UUID        NOT NULL,
  counted_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT membership_referral_credits_membership_id_referee_id_key UNIQUE (membership_id, referee_id)
);

CREATE TABLE membership_status_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  membership_id UUID        NOT NULL REFERENCES user_memberships(id),
  from_status   VARCHAR(20),
  to_status     VARCHAR(20) NOT NULL,
  reason        VARCHAR(100) NOT NULL,
  actor         VARCHAR(10) NOT NULL DEFAULT 'SYSTEM' CHECK (actor IN ('SYSTEM', 'ADMIN', 'USER')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX membership_status_log_membership_id_created_at_idx ON membership_status_log (membership_id, created_at);

-- Locked defaults: 120-day trial, 10 qualifying referrals, counted on the referred user's first order.
INSERT INTO membership_plans (code, name, trial_duration_days, trial_referral_target, count_basis)
VALUES ('FREE_DEFAULT', 'Free Membership', 120, 10, 'FIRST_ORDER')
ON CONFLICT (code) DO NOTHING;
