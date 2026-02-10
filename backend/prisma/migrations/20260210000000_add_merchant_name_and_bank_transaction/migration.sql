-- AlterEnum
ALTER TYPE "DocumentType" ADD VALUE 'BANK_TRANSACTION';

-- AlterTable
ALTER TABLE "DocumentExtraction" ADD COLUMN "merchantName" TEXT;
