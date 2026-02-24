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

    let event: Stripe.Event;
    try {
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
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
            await getEmailService().sendCreditPurchase(org.email, org.name, credits, org.projectCredits, dashboardUrl);
          }
        } catch (emailErr) {
          // Non-fatal — credits are already granted, just log the failure
          console.error('[Stripe Webhook] Failed to send purchase confirmation email:', emailErr);
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
