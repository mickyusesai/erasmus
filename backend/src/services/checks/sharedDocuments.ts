/**
 * Files claimed by more than one participant in the same project: the identical file
 * (same content hash), or a fuel/meal/hotel receipt with the same amount, date and shop.
 * Typical when people travelled together, e.g. both uploading the fuel receipts of one car.
 */
import prisma from '../../utils/prisma.js';

export interface SharedWith {
  participantId: string;
  name: string;
  filename: string;
  how: 'same file' | 'same receipt';
}

/** Receipts that two people can't both have paid for when amount, date and shop are the same */
const RECEIPT_TYPES = new Set(['FUEL_RECEIPT', 'MEAL_RECEIPT', 'HOTEL_INVOICE']);

interface DocLike {
  id: string;
  documentType: string;
  contentHash: string | null;
  renamedFilename: string;
  extraction: { amount: number | null; currency: string | null; documentDate: Date | null; merchantName: string | null } | null;
}

export function receiptKey(doc: DocLike): string | null {
  const e = doc.extraction;
  if (!RECEIPT_TYPES.has(doc.documentType) || !e || e.amount == null || !e.documentDate || !e.merchantName?.trim()) return null;
  return [
    doc.documentType,
    Math.round(e.amount * 100),
    (e.currency || 'EUR').toUpperCase(),
    e.documentDate.toISOString().slice(0, 10),
    e.merchantName.trim().toLowerCase().replace(/\s+/g, ' '),
  ].join('|');
}

/** For each of the participant's documents: who else in the project claimed it */
export async function findSharedDocuments(participantId: string): Promise<Map<string, SharedWith[]>> {
  const result = new Map<string, SharedWith[]>();
  const me = await prisma.participant.findUnique({ where: { id: participantId }, select: { projectId: true } });
  if (!me) return result;

  const select = {
    id: true,
    documentType: true,
    contentHash: true,
    renamedFilename: true,
    extraction: { select: { amount: true, currency: true, documentDate: true, merchantName: true } },
  } as const;
  const mine = await prisma.document.findMany({ where: { participantId }, select });
  if (mine.length === 0) return result;

  const others = await prisma.document.findMany({
    where: { participant: { projectId: me.projectId, id: { not: participantId } } },
    select: { ...select, participant: { select: { id: true, firstName: true, lastName: true } } },
  });
  const byHash = new Map<string, typeof others>();
  const byReceipt = new Map<string, typeof others>();
  for (const o of others) {
    if (o.contentHash) byHash.set(o.contentHash, [...(byHash.get(o.contentHash) ?? []), o]);
    const key = receiptKey(o);
    if (key) byReceipt.set(key, [...(byReceipt.get(key) ?? []), o]);
  }

  for (const doc of mine) {
    const shared: SharedWith[] = [];
    const add = (o: (typeof others)[number], how: SharedWith['how']) => {
      if (shared.some((s) => s.participantId === o.participant.id)) return;
      shared.push({ participantId: o.participant.id, name: `${o.participant.firstName} ${o.participant.lastName}`.trim(), filename: o.renamedFilename, how });
    };
    if (doc.contentHash) for (const o of byHash.get(doc.contentHash) ?? []) add(o, 'same file');
    const key = receiptKey(doc);
    if (key) for (const o of byReceipt.get(key) ?? []) add(o, 'same receipt');
    if (shared.length) result.set(doc.id, shared);
  }
  return result;
}
