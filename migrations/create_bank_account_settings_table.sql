-- Migration: create bank_account_settings table
-- Stores company bank account details for COD deposit collections.
-- Riders use this account number to pay COD amounts.
-- Run manually against your database.

CREATE TABLE IF NOT EXISTS bank_account_settings (
    id                   SERIAL PRIMARY KEY,
    account_holder_name  VARCHAR(255) NOT NULL,
    account_number       VARCHAR(255) NOT NULL UNIQUE,
    bank_name            VARCHAR(255) NOT NULL,
    ifsc_code            VARCHAR(20)  NOT NULL,
    upi_id               VARCHAR(255),
    instructions         TEXT,
    is_active            BOOLEAN      NOT NULL DEFAULT true,

    created_at           TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bank_account_settings_is_active ON bank_account_settings (is_active);
