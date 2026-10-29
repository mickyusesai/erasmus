/**
 * What changed in a participant's trips and files after the AI review looked at them, so the
 * organiser knows the findings may be out of date (e.g. trips rebuilt or files added later).
 */
import prisma from '../../utils/prisma.js';

interface ReviewInput {
  reviewedAt: Date;
  journeyConsolidatedAt: Date | null;
  changeLog: { fieldName: string; changedAt: Date }[];
  uploadDates: Date[];
}

export function describeChangesSinceReview({ reviewedAt, journeyConsolidatedAt, changeLog, uploadDates }: ReviewInput): string[] {
  const after = (d: Date | null) => !!d && d.getTime() > reviewedAt.getTime();
  const fields = changeLog.filter((e) => after(e.changedAt)).map((e) => e.fieldName);
  const changes: string[] = [];

  if (after(journeyConsolidatedAt) || fields.includes('travelItems.rebuilt')) {
    changes.push('the trips were rebuilt');
  } else if (fields.some((f) => f.startsWith('travelItem.') && f !== 'travelItem.order')) {
    changes.push('trips were changed'); // the order of the list doesn't matter to the review
  }
  const added = uploadDates.filter(after).length;
  if (added > 0) changes.push(`${added} file${added === 1 ? ' was' : 's were'} added`);
  if (fields.includes('document.deleted')) changes.push('files were deleted');
  if (fields.some((f) => f.startsWith('declaration'))) changes.push('declarations were changed');
  if (fields.includes('participantNote')) changes.push("the participant's note changed");
  return changes;
}

/** null when the review is up to date, or when there is no review */
export async function reviewOutdated(participant: {
  id: string;
  aiReviewedAt: Date | null;
  journeyConsolidatedAt: Date | null;
  changeLogEntries: { fieldName: string; changedAt: Date }[];
  documents: { uploadDate: Date }[];
}): Promise<{ reviewedAt: Date; changes: string[] } | null> {
  // Reviews from before the review time was kept: the time of their findings
  const reviewedAt =
    participant.aiReviewedAt ??
    (await prisma.aiReviewFinding.findFirst({
      where: { participantId: participant.id },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
    }))?.createdAt;
  if (!reviewedAt) return null;
  const changes = describeChangesSinceReview({
    reviewedAt,
    journeyConsolidatedAt: participant.journeyConsolidatedAt,
    changeLog: participant.changeLogEntries,
    uploadDates: participant.documents.map((d) => d.uploadDate),
  });
  return changes.length > 0 ? { reviewedAt, changes } : null;
}
