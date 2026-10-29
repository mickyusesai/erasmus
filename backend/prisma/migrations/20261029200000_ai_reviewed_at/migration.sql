-- When the last AI review looked at the trips and files (to say when it is out of date)
ALTER TABLE "Participant" ADD COLUMN IF NOT EXISTS "aiReviewedAt" TIMESTAMP(3);
