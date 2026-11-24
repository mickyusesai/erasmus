-- The first name of whoever signed up, and when the one onboarding reminder went out.
-- (The schema is synced with `prisma db push` at start-up; this file documents the change.)
ALTER TABLE "Organisation" ADD COLUMN IF NOT EXISTS "contactFirstName" TEXT;
ALTER TABLE "Organisation" ADD COLUMN IF NOT EXISTS "onboardingReminderSentAt" TIMESTAMP(3);
