import { clsx } from 'clsx';
import type { ParticipantStatus } from '../../services/api';

interface StatusBadgeProps {
  status: ParticipantStatus;
  size?: 'sm' | 'md';
}

const statusConfig: Record<ParticipantStatus, { label: string; className: string }> = {
  DRAFT: {
    label: 'Draft',
    className: 'bg-gray-100 text-gray-600',
  },
  PARTICIPANT_COMPLETE: {
    label: 'Complete',
    className: 'bg-amber-100 text-amber-700',
  },
  ADMIN_APPROVED: {
    label: 'Approved',
    className: 'bg-emerald-100 text-emerald-700',
  },
  PAID: {
    label: 'Paid',
    className: 'bg-purple-100 text-purple-700',
  },
};

export function StatusBadge({ status, size = 'md' }: StatusBadgeProps) {
  const config = statusConfig[status];

  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full font-medium',
        config.className,
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs'
      )}
    >
      {config.label}
    </span>
  );
}
