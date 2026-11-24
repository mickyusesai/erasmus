-- The practice project of an organisation: a made-up exchange to try everything with.
-- (The schema is synced with `prisma db push` at start-up; this file documents the change.)
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "isPracticeProject" BOOLEAN NOT NULL DEFAULT false;
