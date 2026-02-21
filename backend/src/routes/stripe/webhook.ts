import { Router, Request, Response } from 'express';
import express from 'express';
import Stripe from 'stripe';
import prisma from '../../utils/prisma.js';
import { asyncHandler } from '../../middleware/errorHandler.js';

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
