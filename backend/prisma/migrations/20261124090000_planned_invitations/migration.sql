-- Invitations can be planned for a day: when it comes, participants without a link get theirs.
-- (The schema is synced with `prisma db push` at start-up; this file documents the change.)
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "inviteAt" TIMESTAMP(3);
