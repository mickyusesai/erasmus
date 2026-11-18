-- The onboarding test account (super-admin): an organisation that is recreated from scratch on every start
ALTER TABLE "Organisation" ADD COLUMN IF NOT EXISTS "isTestAccount" BOOLEAN NOT NULL DEFAULT false;
