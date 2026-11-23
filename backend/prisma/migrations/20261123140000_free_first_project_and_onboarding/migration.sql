-- The first project of an organisation is free (up to 10 participants); first-run guidance is remembered per organisation
ALTER TABLE "Organisation" ADD COLUMN IF NOT EXISTS "freeProjectUsedAt" TIMESTAMP(3);
ALTER TABLE "Organisation" ADD COLUMN IF NOT EXISTS "onboarding" JSONB;
