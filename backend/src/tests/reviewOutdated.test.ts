import { describe, it, expect } from 'vitest';
import { describeChangesSinceReview } from '../services/checks/reviewOutdated.js';

const t = (s: string) => new Date(`2026-10-${s}Z`);
const reviewedAt = t('20T10:00:00');

describe('AI review out of date', () => {
  it('says what changed after the review', () => {
    expect(describeChangesSinceReview({
      reviewedAt,
      journeyConsolidatedAt: t('27T08:00:00'),
      changeLog: [
        { fieldName: 'travelItems.rebuilt', changedAt: t('27T08:00:00') },
        { fieldName: 'travelItem.amountEur', changedAt: t('27T09:00:00') },
        { fieldName: 'document.deleted', changedAt: t('27T09:30:00') },
      ],
      uploadDates: [t('19T12:00:00'), t('27T07:55:00'), t('29T07:00:00')],
    })).toEqual(['the trips were rebuilt', '2 files were added', 'files were deleted']);
  });

  it('is up to date when nothing that the review looks at changed', () => {
    expect(describeChangesSinceReview({
      reviewedAt,
      journeyConsolidatedAt: t('19T08:00:00'),
      changeLog: [
        { fieldName: 'travelItem.amountEur', changedAt: t('19T09:00:00') }, // before the review
        { fieldName: 'travelItem.order', changedAt: t('21T09:00:00') }, // only the order of the list
        { fieldName: 'greenTravelExtra.food', changedAt: t('21T09:00:00') },
      ],
      uploadDates: [t('19T12:00:00')],
    })).toEqual([]);
  });
});
