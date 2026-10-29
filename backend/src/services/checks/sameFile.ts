/**
 * The participant's earlier upload of exactly this file. Files uploaded before file hashes
 * were kept have none: earlier files of the same size are hashed now, and the hash is saved.
 */
import { createHash } from 'crypto';
import prisma from '../../utils/prisma.js';
import { getStorageService } from '../storage/index.js';

export function fileHash(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

export async function findSameFile(participantId: string, buffer: Buffer, contentHash = fileHash(buffer)) {
  const same = await prisma.document.findFirst({ where: { participantId, contentHash } });
  if (same) return same;

  const unhashed = await prisma.document.findMany({ where: { participantId, contentHash: null, fileSize: buffer.length } });
  const storage = getStorageService();
  for (const doc of unhashed) {
    try {
      const hash = fileHash(await storage.retrieve(doc.storedFilePath));
      const updated = await prisma.document.update({ where: { id: doc.id }, data: { contentHash: hash } });
      if (hash === contentHash) return updated;
    } catch (err) {
      console.warn(`[Documents] Could not read ${doc.id} to compare it:`, err instanceof Error ? err.message : err);
    }
  }
  return null;
}
