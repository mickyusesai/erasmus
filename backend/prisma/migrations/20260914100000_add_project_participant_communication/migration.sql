-- AlterTable
ALTER TABLE "Project" ADD COLUMN "participantInstructions" TEXT;
ALTER TABLE "Project" ADD COLUMN "documentDeadline" TIMESTAMP(3);
ALTER TABLE "Project" ADD COLUMN "contactEmail" TEXT;
ALTER TABLE "Project" ADD COLUMN "contactPhone" TEXT;
