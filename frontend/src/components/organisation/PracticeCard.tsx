import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowRight, GraduationCap } from 'lucide-react';
import toast from 'react-hot-toast';
import { organisationApi, type OrgDashboardData } from '../../services/api';
import { PRACTICE_STEP_TEXT, practiceProgress } from '../../utils/practiceGuide';

/**
 * Opens the practice project. A new organisation has one from the start; when there is none
 * (an older organisation, or it was removed) it is made first, which takes a moment.
 */
export function useOpenPractice() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [opening, setOpening] = useState(false);

  /** Answers whether it was opened */
  const open = async (known?: string | null): Promise<boolean> => {
    if (known) {
      navigate(`/org/projects/${known}`);
      return true;
    }
    setOpening(true);
    try {
      const { projectId, practice } = await organisationApi.openPracticeProject();
      queryClient.setQueryData<OrgDashboardData>(['org-dashboard'], (current) => (current ? { ...current, practice } : current));
      navigate(`/org/projects/${projectId}`);
      return true;
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : 'The practice project could not be opened. Please try again.');
      return false;
    } finally {
      setOpening(false);
    }
  };
  return { open, opening };
}

/**
 * The practice project on the dashboard. For an organisation that is getting started, while
 * the guide is under way: a card with the step it is at. Otherwise (the guide is done or put
 * away, or the organisation is under way with its own projects: `quiet`): one line, so it can
 * always be found again.
 */
export function PracticeCard({ dashboard, quiet = false }: { dashboard: OrgDashboardData; quiet?: boolean }) {
  const queryClient = useQueryClient();
  const { open, opening } = useOpenPractice();
  const practice = dashboard.practice ?? null;
  const guide = practice?.guide;

  const showGuideAgain = async () => {
    queryClient.setQueryData<OrgDashboardData>(['org-dashboard'], (current) =>
      current?.practice ? { ...current, practice: { ...current.practice, guide: { ...current.practice.guide, closed: false } } } : current
    );
    await organisationApi.setPracticeGuideClosed(false).catch(() => undefined);
    queryClient.invalidateQueries({ queryKey: ['org-dashboard'] });
    open(practice?.projectId);
  };

  // The guide is under way: say where it is
  if (!quiet && practice && guide && !guide.complete && !guide.closed && guide.next) {
    const progress = practiceProgress(guide);
    const step = PRACTICE_STEP_TEXT[guide.next];
    const started = progress.done > 0;
    return (
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6" data-practice-card>
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-5">
          <div className="flex items-start gap-4 min-w-0">
            <div className="w-11 h-11 rounded-xl bg-primary-50 flex items-center justify-center flex-shrink-0">
              <GraduationCap className="w-5 h-5 text-primary-600" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                {started ? `Practice project · ${progress.done} of ${progress.total} done` : 'Try it first · 2 minutes'}
              </p>
              <h2 className="text-lg font-semibold text-gray-900 mt-0.5">{started ? step.title : 'See how it works in the practice project'}</h2>
              <p className="text-sm text-gray-600 mt-1">
                {started
                  ? step.text
                  : 'A made-up youth exchange with five made-up participants: approve one, ask one a question, and be a participant yourself. Nothing is real, and no email is sent.'}
              </p>
            </div>
          </div>
          <button
            onClick={() => open(practice.projectId)}
            className="flex-shrink-0 inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-gray-900 text-white font-medium hover:bg-gray-800 active:scale-[0.98] transition-all"
          >
            {started ? 'Continue the practice' : 'Open the practice project'} <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  // Done, put away, or not there (yet): one line to find it again
  return (
    <div className="flex items-center justify-between gap-4 flex-wrap px-5 py-3 bg-white rounded-2xl border border-gray-200" data-practice-card>
      <p className="flex items-center gap-2 text-sm text-gray-600 min-w-0">
        <GraduationCap className="w-4 h-4 text-gray-400 flex-shrink-0" />
        <span>
          <span className="font-medium text-gray-900">Practice project</span> · a made-up exchange to try things with. Nothing in it is real.
        </span>
      </p>
      <div className="flex items-center gap-4 flex-shrink-0">
        {!quiet && practice && guide?.closed && !guide.complete && (
          <button onClick={showGuideAgain} className="text-sm text-gray-500 hover:text-gray-800 underline underline-offset-2">
            Take the guide out again
          </button>
        )}
        <button
          onClick={() => open(practice?.projectId)}
          disabled={opening}
          className="text-sm font-medium text-primary-600 hover:text-primary-700 disabled:opacity-60 inline-flex items-center gap-1"
        >
          {opening ? 'Setting it up…' : 'Open it'} {!opening && <ArrowRight className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}
