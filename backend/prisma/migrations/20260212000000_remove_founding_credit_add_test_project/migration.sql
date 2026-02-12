-- Remove founding credit fields from Organisation
ALTER TABLE "Organisation" DROP COLUMN IF EXISTS "foundingCreditClaimed";
ALTER TABLE "Organisation" DROP COLUMN IF EXISTS "foundingCreditClaimedAt";
ALTER TABLE "Organisation" DROP COLUMN IF EXISTS "foundingCreditExpiresAt";
ALTER TABLE "Organisation" DROP COLUMN IF EXISTS "foundingCreditUsed";

-- Add test project fields to Project
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "isTestProject" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "maxParticipants" INTEGER;
