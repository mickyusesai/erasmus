-- Who linked a customer to an affiliate by hand (null = linked through the affiliate's code at checkout)
ALTER TABLE "AffiliateLink" ADD COLUMN IF NOT EXISTS "addedBy" TEXT;
