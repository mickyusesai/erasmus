-- AlterTable: Add password reset fields to Organisation
ALTER TABLE "Organisation" ADD COLUMN "passwordResetToken" TEXT;
ALTER TABLE "Organisation" ADD COLUMN "passwordResetExpiresAt" TIMESTAMP(3);

-- CreateIndex: Unique index on password reset token
CREATE UNIQUE INDEX "Organisation_passwordResetToken_key" ON "Organisation"("passwordResetToken");
