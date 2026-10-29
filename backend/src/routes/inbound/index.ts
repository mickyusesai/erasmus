import express, { Router, Request, Response } from 'express';
import { timingSafeEqual } from 'crypto';
import { asyncHandler } from '../../middleware/errorHandler.js';
import { handleInboundEmail, type PostmarkInbound } from '../../services/email/inbound.js';

/**
 * Postmark inbound webhook: participants' replies to reply+<code>@<INBOUND_EMAIL_DOMAIN>.
 * Postmark calls https://<app>/api/inbound/postmark?token=<INBOUND_WEBHOOK_TOKEN>.
 */
const router = Router();

// Replies can carry attachments, so this route parses its own, larger JSON body
router.use(express.json({ limit: '40mb' }));

function tokenMatches(given: unknown): boolean {
  const expected = process.env.INBOUND_WEBHOOK_TOKEN;
  if (!expected || typeof given !== 'string') return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

router.post('/postmark', asyncHandler(async (req: Request, res: Response) => {
  if (!tokenMatches(req.query.token)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const result = await handleInboundEmail(req.body as PostmarkInbound);
  res.json(result);
}));

export default router;
