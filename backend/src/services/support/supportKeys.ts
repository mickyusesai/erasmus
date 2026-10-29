/**
 * Read-only support keys: created in super-admin, valid for 24 hours, stored as a SHA-256
 * hash. Used as "Authorization: Bearer erk_..." on /api/support.
 */
import { createHash, randomBytes } from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import prisma from '../../utils/prisma.js';

export const SUPPORT_KEY_HOURS = 24;

const hashKey = (key: string) => createHash('sha256').update(key).digest('hex');

export async function createSupportKey(label: string | null) {
  const key = `erk_${randomBytes(24).toString('hex')}`;
  const record = await prisma.supportKey.create({
    data: { keyHash: hashKey(key), label, expiresAt: new Date(Date.now() + SUPPORT_KEY_HOURS * 60 * 60 * 1000) },
  });
  return { key, record };
}

/** Lets a request through only with a valid, unexpired, unrevoked support key */
export async function supportKeyAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const [scheme, key] = (req.headers.authorization || '').split(' ');
  if (scheme !== 'Bearer' || !key?.startsWith('erk_')) {
    res.status(401).json({ error: { message: 'A support key is required' } });
    return;
  }
  const record = await prisma.supportKey.findUnique({ where: { keyHash: hashKey(key) } });
  if (!record || record.revokedAt || record.expiresAt <= new Date()) {
    res.status(401).json({ error: { message: 'This support key is not valid (expired or revoked)' } });
    return;
  }
  await prisma.supportKey.update({ where: { id: record.id }, data: { lastUsedAt: new Date(), useCount: { increment: 1 } } });
  console.log(`[Support] key ${record.id} ${req.method} ${req.originalUrl}`);
  next();
}
