-- Invoicing identity for Stripe invoices ("Bill to" block) and a per-purchase project reference
ALTER TABLE "Organisation"
  ADD COLUMN IF NOT EXISTS "registrationNumber" TEXT,
  ADD COLUMN IF NOT EXISTS "billingStreet" TEXT,
  ADD COLUMN IF NOT EXISTS "billingPostalCode" TEXT,
  ADD COLUMN IF NOT EXISTS "billingCity" TEXT,
  ADD COLUMN IF NOT EXISTS "billingCountry" TEXT,
  ADD COLUMN IF NOT EXISTS "stripeCustomerId" TEXT;

ALTER TABLE "Purchase"
  ADD COLUMN IF NOT EXISTS "invoiceReference" TEXT;
