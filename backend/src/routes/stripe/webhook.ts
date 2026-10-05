import { Router, Request, Response } from 'express';
import express from 'express';
import Stripe from 'stripe';
import prisma from '../../utils/prisma.js';
import { asyncHandler } from '../../middleware/errorHandler.js';
import { getEmailService } from '../../services/email/index.js';

const router = Router();

/**
 * POST /api/stripe/webhook
 * Stripe webhook — must use raw body (registered before express.json())
 */
router.post(
  '/webhook',
  express.raw({ type: 'application/json' }),
  asyncHandler(async (req: Request, res: Response) => {
    const sig = req.headers['stripe-signature'] as string;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
      console.error('[Stripe Webhook] STRIPE_WEBHOOK_SECRET not configured');
      res.status(500).json({ error: 'Webhook secret not configured' });
      return;
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err) {
      console.error('[Stripe Webhook] Signature verification failed:', err);
      res.status(400).json({ error: 'Invalid signature' });
      return;
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const { organisationId, purchaseId, creditsGranted } = session.metadata || {};

      if (!organisationId || !purchaseId) {
        console.error('[Stripe Webhook] Missing metadata on session', session.id);
        res.json({ received: true });
        return;
      }

      const credits = parseInt(creditsGranted || '0', 10);

      // Retrieve the hosted invoice URL if Stripe generated one
      let invoiceUrl: string | null = null;
      if (typeof session.invoice === 'string') {
        try {
          const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
          const invoice = await stripe.invoices.retrieve(session.invoice);
          invoiceUrl = invoice.hosted_invoice_url ?? null;
        } catch (invoiceErr) {
          console.error('[Stripe Webhook] Failed to retrieve invoice URL:', invoiceErr);
        }
      }

      try {
        await prisma.$transaction([
          prisma.purchase.update({
            where: { id: purchaseId },
            data: {
              status: 'COMPLETED',
              completedAt: new Date(),
              stripePaymentIntentId: typeof session.payment_intent === 'string'
                ? session.payment_intent
                : session.payment_intent?.id ?? null,
              stripeInvoiceUrl: invoiceUrl,
            },
          }),
          prisma.organisation.update({
            where: { id: organisationId },
            data: { projectCredits: { increment: credits } },
          }),
        ]);

        console.log(`[Stripe Webhook] Granted ${credits} credits to org ${organisationId}`);

        // Send purchase confirmation email
        try {
          const org = await prisma.organisation.findUnique({ where: { id: organisationId } });
          if (org) {
            const dashboardUrl = `${process.env.FRONTEND_URL || 'https://app.easyreimburse.ai'}/org/dashboard`;
            await getEmailService().sendCreditPurchase(org.email, org.name, credits, org.projectCredits, dashboardUrl, invoiceUrl);
          }
        } catch (emailErr) {
          // Non-fatal — credits are already granted, just log the failure
          console.error('[Stripe Webhook] Failed to send purchase confirmation email:', emailErr);
        }

        // Affiliate commission tracking (non-fatal)
        try {
          // Extract the human-readable promotion code string (e.g. "YASIR10")
          const rawDiscounts = (session as any).discounts as Array<{
            coupon?: { id?: string } | string;
            promotion_code?: { id?: string } | string;
          }> | undefined;
          const firstDiscount = rawDiscounts?.[0];

          let affiliateLookupCode: string | null = null;

          // Prefer promotion_code (human-readable string) over raw coupon ID
          const rawPromoCode = firstDiscount?.promotion_code;
          const promoCodeId = typeof rawPromoCode === 'string' ? rawPromoCode : (rawPromoCode as any)?.id ?? null;
          if (promoCodeId) {
            try {
              const promoCode = await stripe.promotionCodes.retrieve(promoCodeId);
              affiliateLookupCode = promoCode.code;
            } catch {
              // fall through to coupon ID
            }
          }

          // Fallback: use coupon ID directly
          if (!affiliateLookupCode) {
            const firstCoupon = firstDiscount?.coupon;
            affiliateLookupCode = typeof firstCoupon === 'string'
              ? firstCoupon
              : (firstCoupon as any)?.id ?? null;
          }

          // If a code was used, try to create an AffiliateLink for this customer
          if (affiliateLookupCode) {
            const affiliate = await prisma.organisation.findFirst({
              where: { affiliateCode: affiliateLookupCode, isAffiliate: true, affiliateActive: true },
            });
            if (affiliate) {
              // Only link if not already linked to any affiliate
              await prisma.affiliateLink.upsert({
                where: { customerId: organisationId },
                create: { affiliateId: affiliate.id, customerId: organisationId },
                update: {}, // already linked — keep original
              });
              console.log(`[Affiliate] Linked org ${organisationId} to affiliate ${affiliate.id} via code ${affiliateLookupCode}`);
            }
          }

          // Create commission for any linked customer (whether code used now or previously)
          const link = await prisma.affiliateLink.findUnique({
            where: { customerId: organisationId },
            include: { affiliate: { select: { id: true, commissionRate: true, isAffiliate: true } } },
          });
          if (link && link.affiliate.isAffiliate && (link.affiliate.commissionRate ?? 0) > 0) {
            const purchaseRecord = await prisma.purchase.findUnique({ where: { id: purchaseId } });
            const paidCents = session.amount_total ?? purchaseRecord?.amountCents ?? 0;
            if (paidCents > 0) {
              const commissionCents = Math.round(paidCents * link.affiliate.commissionRate!);
              if (commissionCents > 0) {
                await prisma.affiliateCommission.upsert({
                  where: { purchaseId },
                  create: {
                    affiliateId: link.affiliateId,
                    affiliateLinkId: link.id,
                    purchaseId,
                    amountCents: commissionCents,
                    commissionRate: link.affiliate.commissionRate!,
                    status: 'PENDING',
                  },
                  update: {}, // idempotent on webhook retry
                });
                console.log(`[Affiliate] Commission ${commissionCents}¢ for affiliate ${link.affiliateId}`);
              }
            }
          }
        } catch (affiliateErr) {
          console.error('[Stripe Webhook] Affiliate processing failed (non-fatal):', affiliateErr);
        }
      } catch (err) {
        console.error('[Stripe Webhook] DB update failed:', err);
        res.status(500).json({ error: 'DB update failed' });
        return;
      }
    }

    res.json({ received: true });
  })
);

export default router;
