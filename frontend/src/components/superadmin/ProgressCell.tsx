import { clsx } from 'clsx';

/** How far an organisation has come since signing up (from GET /super-admin/organisations) */
export interface OrganisationProgress {
  /** Steps of the practice guide done (0 to 5); null when there is no practice project */
  practiceSteps: number | null;
  projects: number;
  participants: number;
  invited: number;
  /** Participants who handed in */
  submitted: number;
  /** Completed purchases */
  purchases: number;
  reminderSentAt: string | null;
  stage: 'SIGNED_UP' | 'PROJECT' | 'PARTICIPANTS' | 'INVITED' | 'SUBMISSION';
}

/**
 * One organisation's way in, as five dots: tried the practice project, set up a project of
 * its own, invited participants, got a first hand-in, bought a credit. Hover a dot for the
 * number behind it.
 */
export function ProgressCell({ progress }: { progress?: OrganisationProgress }) {
  if (!progress) return <span className="text-gray-600">—</span>;
  const practice = progress.practiceSteps ?? 0;
  const marks = [
    {
      label: 'Practice',
      state: practice >= 5 ? 'done' : practice > 0 ? 'partly' : 'none',
      title: progress.practiceSteps === null ? 'No practice project' : `Practice project: ${practice} of 5 steps done`,
    },
    {
      label: 'Project',
      state: progress.participants > 0 ? 'done' : progress.projects > 0 ? 'partly' : 'none',
      title: `${progress.projects} own project${progress.projects === 1 ? '' : 's'}, ${progress.participants} participant${progress.participants === 1 ? '' : 's'}`,
    },
    { label: 'Invited', state: progress.invited > 0 ? 'done' : 'none', title: `${progress.invited} participant${progress.invited === 1 ? '' : 's'} invited` },
    { label: 'Hand-in', state: progress.submitted > 0 ? 'done' : 'none', title: `${progress.submitted} participant${progress.submitted === 1 ? '' : 's'} handed in` },
    { label: 'Bought', state: progress.purchases > 0 ? 'done' : 'none', title: `${progress.purchases} purchase${progress.purchases === 1 ? '' : 's'}` },
  ] as const;

  return (
    <div data-progress={progress.stage}>
      <div className="flex items-center gap-1.5">
        {marks.map((mark) => (
          <span
            key={mark.label}
            title={mark.title}
            aria-label={mark.title}
            className={clsx(
              'px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap',
              mark.state === 'done' ? 'bg-emerald-600/25 text-emerald-300' : mark.state === 'partly' ? 'bg-amber-500/20 text-amber-300' : 'bg-gray-700/60 text-gray-500'
            )}
          >
            {mark.label}
          </span>
        ))}
      </div>
      {progress.reminderSentAt && (
        <p className="text-[10px] text-gray-500 mt-1" title="The one reminder for an organisation that had not got going three days after signing up">
          Reminded on {new Date(progress.reminderSentAt).toLocaleDateString()}
        </p>
      )}
    </div>
  );
}
