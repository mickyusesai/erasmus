-- Written confirmation from the airline that the passenger flew; substitutes a boarding pass
ALTER TYPE "DocumentType" ADD VALUE IF NOT EXISTS 'AIRLINE_DECLARATION';

-- Per project: don't accept a declaration on honour for a missing boarding pass
ALTER TABLE "Project"
  ADD COLUMN IF NOT EXISTS "requireAirlineDeclaration" BOOLEAN NOT NULL DEFAULT false;
