/**
 * A compact, factual description of one participant's reimbursement, for the small AI
 * helpers (summarising a participant's email, drafting a message to the participant).
 */
import prisma from '../../utils/prisma.js';
import { sortTravelItemsByJourney } from '../../utils/sortTravelItems.js';
import { isReceiptDocument } from '../../utils/documentKinds.js';

export async function loadParticipantForAi(participantId: string) {
  const participant = await prisma.participant.findUnique({
    where: { id: participantId },
    include: {
      project: { include: { organisation: { select: { name: true } } } },
      travelItems: true,
      documents: {
        select: { id: true, renamedFilename: true, documentType: true, uploadDate: true },
        orderBy: [{ uploadDate: 'asc' }, { id: 'asc' }],
      },
      aiReviewFindings: { where: { checked: false }, orderBy: { createdAt: 'asc' } },
    },
  });
  if (!participant) return null;
  return { ...participant, travelItems: sortTravelItemsByJourney(participant.travelItems) };
}

type LoadedParticipant = NonNullable<Awaited<ReturnType<typeof loadParticipantForAi>>>;

const day = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : '?');

export function describeParticipantForAi(p: LoadedParticipant): string {
  const trips = p.travelItems.map((t, i) => {
    const notes: string[] = [];
    if (t.excludedFromReimbursement) notes.push('not reimbursed');
    if (t.amountIncludedInRoundTrip) notes.push('price on the outbound leg');
    if (t.amountEur == null && !t.amountIncludedInRoundTrip) notes.push('no price');
    return `${i + 1}. [${t.modeOfTransport}] ${t.fromLocation} → ${t.toLocation} | ${day(t.departureDate)} | ${
      t.amountEur != null ? `€${t.amountEur.toFixed(2)}` : 'no amount'
    }${t.flightNumber ? ` | flight ${t.flightNumber}` : ''}${notes.length ? ` | ${notes.join(', ')}` : ''}`;
  });
  const tripIndex = new Map(p.travelItems.map((t, i) => [t.id, i + 1]));
  const docs = p.documents.map((d) => `- "${d.renamedFilename}" (${isReceiptDocument(d) ? 'food/accommodation receipt' : d.documentType})`);
  const findings = p.aiReviewFindings.map(
    (f) => `- [${f.severity}] ${f.category}: ${f.message}${f.travelItemId && tripIndex.has(f.travelItemId) ? ` (trip ${tripIndex.get(f.travelItemId)})` : ''}`
  );

  return `PARTICIPANT: ${p.firstName} ${p.lastName} (${p.country}), status ${p.status}
PROJECT: "${p.project.name}" in ${p.project.country}, ${day(p.project.startDate)} to ${day(p.project.endDate)}, organised by ${p.project.organisation.name}

TRIPS (${trips.length}):
${trips.join('\n') || 'none'}

DOCUMENTS (${docs.length}):
${docs.join('\n') || 'none'}

OPEN AI REVIEW FINDINGS (${findings.length}, not yet ticked by the organisation):
${findings.join('\n') || 'none'}
${p.reopenMessage ? `\nLAST MESSAGE THE ORGANISATION SENT WHEN REOPENING:\n"${p.reopenMessage}"\n` : ''}`;
}
