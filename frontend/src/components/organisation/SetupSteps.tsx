import { Check } from 'lucide-react';
import { clsx } from 'clsx';

export const SETUP_STEPS = ['Project', 'Participants', 'Amounts', 'Invitations'] as const;
export type SetupStep = 1 | 2 | 3 | 4;

/**
 * Where you are in setting up a project: four short steps. A step that is done can be gone
 * back to (when `onGo` is given).
 */
export function SetupSteps({ current, done, onGo }: { current: SetupStep; done: SetupStep[]; onGo?: (step: SetupStep) => void }) {
  return (
    <ol className="flex items-center gap-2 sm:gap-4 flex-wrap" aria-label="The steps of setting up a project">
      {SETUP_STEPS.map((label, index) => {
        const step = (index + 1) as SetupStep;
        const isDone = done.includes(step);
        const isCurrent = step === current;
        const canGo = !!onGo && step !== 1 && !isCurrent && (isDone || done.includes((step - 1) as SetupStep));
        const content = (
          <>
            <span
              className={clsx(
                'w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0',
                isCurrent ? 'bg-primary-600 text-white' : isDone ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'
              )}
            >
              {isDone && !isCurrent ? <Check className="w-3.5 h-3.5" /> : step}
            </span>
            <span className={clsx('text-sm', isCurrent ? 'font-semibold text-gray-900' : isDone ? 'text-emerald-700' : 'text-gray-400')}>{label}</span>
          </>
        );
        return (
          <li key={label} aria-current={isCurrent ? 'step' : undefined}>
            {canGo ? (
              <button type="button" onClick={() => onGo(step)} className="flex items-center gap-2 hover:opacity-80">
                {content}
              </button>
            ) : (
              <span className="flex items-center gap-2">{content}</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
