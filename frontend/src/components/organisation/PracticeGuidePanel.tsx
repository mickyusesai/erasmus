import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Check, ChevronDown, ChevronUp, GraduationCap } from 'lucide-react';
import { clsx } from 'clsx';
import toast from 'react-hot-toast';
import { organisationApi, type OrgDashboardData, type PracticeGuide, type PracticeStep, type RememberedPracticeStep } from '../../services/api';
import {
  PRACTICE_STEP_TEXT,
  PRACTICE_TARGET,
  atPracticePlace,
  practicePlace,
  practiceProgress,
  practiceStepBlocked,
  type PracticePage,
} from '../../utils/practiceGuide';
import { nextStep } from '../../utils/gettingStarted';
import { Spotlight } from './Spotlight';

/**
 * The organisation's practice project and its guide, from the dashboard answer (shared with
 * the dashboard page). Pages outside the practice project pass false, so they don't ask for it.
 */
export function usePractice(enabled = true) {
  const { data } = useQuery({ queryKey: ['org-dashboard'], queryFn: organisationApi.getDashboard, retry: false, enabled });
  const dashboard = data as OrgDashboardData | undefined;
  return { dashboard, practice: dashboard?.practice ?? null };
}

/** Remembers a step that leaves no trace in the practice project (looked around, downloaded the audit file) */
export function useMarkPracticeStep() {
  const queryClient = useQueryClient();
  return (step: RememberedPracticeStep) => {
    const current = queryClient.getQueryData<OrgDashboardData>(['org-dashboard']);
    const known = current?.practice?.guide.steps.find((s) => s.id === step);
    if (!current?.practice || !known || known.done || current.supportSession) return;
    // Shown as done straight away; the server's answer follows
    const steps = current.practice.guide.steps.map((s) => (s.id === step ? { ...s, done: true } : s));
    const guide: PracticeGuide = {
      ...current.practice.guide,
      steps,
      next: steps.find((s) => !s.done && s.possible)?.id ?? null,
      complete: steps.every((s) => s.done),
    };
    queryClient.setQueryData<OrgDashboardData>(['org-dashboard'], { ...current, practice: { ...current.practice, guide } });
    organisationApi
      .markPracticeStep(step)
      .catch(() => undefined)
      .finally(() => queryClient.invalidateQueries({ queryKey: ['org-dashboard'] }));
  };
}

/**
 * The guide through the practice project: a small panel in the corner of the practice
 * project's pages. It says what the current step is, takes you to the page where it is done,
 * and there points at the real button. Shown only inside the practice project.
 */
export function PracticeGuidePanel({ page }: { page: PracticePage }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { dashboard, practice } = usePractice();
  const markStep = useMarkPracticeStep();
  const [picked, setPicked] = useState<PracticeStep | null>(null);
  const [small, setSmall] = useState(() => sessionStorage.getItem('practice-guide-small') === '1');
  const guide = practice?.guide;

  // Coming back from the participant's page in another tab: see what was done there
  useEffect(() => {
    const onFocus = () => {
      queryClient.invalidateQueries({ queryKey: ['org-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['org-participants'] });
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [queryClient]);

  // Whoever opens a participant has looked around
  const meetDone = guide?.steps.find((s) => s.id === 'MEET')?.done;
  useEffect(() => {
    if (guide && page.kind === 'participant' && meetDone === false) markStep('MEET');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page.kind, meetDone, !!guide]);

  if (!guide || !dashboard || guide.closed) return null;

  const setSmallAndRemember = (value: boolean) => {
    setSmall(value);
    sessionStorage.setItem('practice-guide-small', value ? '1' : '0');
  };
  const progress = practiceProgress(guide);
  const isDone = (id: PracticeStep) => !!guide.steps.find((s) => s.id === id)?.done;
  const shown: PracticeStep | null = picked && !isDone(picked) ? picked : guide.next;

  const putAway = () => {
    queryClient.setQueryData<OrgDashboardData>(['org-dashboard'], (current) =>
      current?.practice ? { ...current, practice: { ...current.practice, guide: { ...current.practice.guide, closed: true } } } : current
    );
    organisationApi
      .setPracticeGuideClosed(true)
      .catch(() => undefined)
      .finally(() => queryClient.invalidateQueries({ queryKey: ['org-dashboard'] }));
    toast('The guide is put away. You can take it out again on the dashboard.');
  };

  const shell = (children: React.ReactNode) => (
    <div className="fixed bottom-4 right-4 left-4 sm:left-auto sm:w-[22rem] z-40" data-practice-guide>
      <div className="rounded-2xl p-[2px] bg-gradient-soft shadow-elevated">
        <div className="bg-white rounded-[14px] overflow-hidden">{children}</div>
      </div>
    </div>
  );

  const header = (
    <button
      type="button"
      onClick={() => setSmallAndRemember(!small)}
      className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
      aria-expanded={!small}
    >
      <span className="flex items-center gap-2 min-w-0">
        <GraduationCap className="w-4 h-4 text-primary-600 flex-shrink-0" />
        <span className="text-sm font-semibold text-gray-900 truncate">Practice guide</span>
        <span className="text-xs text-gray-500 flex-shrink-0">
          {progress.done} of {progress.total} done
        </span>
      </span>
      {small ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
    </button>
  );

  if (small) return shell(header);

  // Everything tried: on to the organisation's own project
  if (guide.complete || !shown) {
    const own = nextStep(dashboard);
    return shell(
      <>
        {header}
        <div className="px-4 pb-4">
          <h3 className="font-semibold text-gray-900">{guide.complete ? "That's the whole round" : 'Nothing left to try here'}</h3>
          <p className="text-sm text-gray-600 mt-1">
            {guide.complete
              ? 'You approved, asked a question, were a participant yourself and downloaded the audit file. That is all there is to it.'
              : 'The steps that are left need a participant who was deleted. Start the practice again to get everybody back.'}
          </p>
          <Link
            to={own?.to ?? '/org/dashboard'}
            className="mt-3 w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-soft text-white text-sm font-medium hover:opacity-90 transition-opacity"
          >
            {own ? own.button : 'Back to your dashboard'} <ArrowRight className="w-4 h-4" />
          </Link>
          <button onClick={putAway} className="mt-2 w-full text-xs text-gray-500 hover:text-gray-800">
            Put the guide away
          </button>
        </div>
      </>
    );
  }

  const text = PRACTICE_STEP_TEXT[shown];
  const here = atPracticePlace(guide, shown, page);
  const blocked = practiceStepBlocked(guide, shown);
  const place = practicePlace(guide, shown);
  const target = PRACTICE_TARGET[shown];

  return shell(
    <>
      {header}
      <ol className="px-4 flex items-center gap-1.5" aria-label="The steps of the practice">
        {guide.steps.map((step, index) => (
          <li key={step.id} className="flex-1">
            <button
              type="button"
              onClick={() => setPicked(step.id)}
              title={PRACTICE_STEP_TEXT[step.id].label}
              aria-label={`Step ${index + 1}: ${PRACTICE_STEP_TEXT[step.id].label}${step.done ? ' (done)' : ''}`}
              aria-current={step.id === shown ? 'step' : undefined}
              className={clsx(
                'w-full h-7 rounded-lg text-xs font-semibold flex items-center justify-center transition-colors',
                step.done ? 'bg-emerald-100 text-emerald-700' : step.id === shown ? 'bg-primary-100 text-primary-700 ring-2 ring-primary-300' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              )}
            >
              {step.done ? <Check className="w-3.5 h-3.5" /> : index + 1}
            </button>
          </li>
        ))}
      </ol>

      <div className="px-4 pt-3 pb-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-primary-600">
          Step {guide.steps.findIndex((s) => s.id === shown) + 1} of {guide.steps.length}
        </p>
        <h3 className="font-semibold text-gray-900 mt-0.5">{text.title}</h3>
        <p className="text-sm text-gray-600 mt-1">{blocked ?? (here ? text.here : text.text)}</p>

        {blocked ? (
          shown === 'AUDIT' && !isDone('APPROVE') ? (
            <button
              onClick={() => setPicked('APPROVE')}
              className="mt-3 w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gray-100 text-gray-800 text-sm font-medium hover:bg-gray-200 transition-colors"
            >
              Go to "Approve Jonas"
            </button>
          ) : null
        ) : shown === 'MEET' && here ? (
          <button
            onClick={() => markStep('MEET')}
            className="mt-3 w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-soft text-white text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Got it <ArrowRight className="w-4 h-4" />
          </button>
        ) : place?.kind === 'participant-page' ? (
          <a
            href={place.path}
            className="mt-3 w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-soft text-white text-sm font-medium hover:opacity-90 transition-opacity"
          >
            {text.go} <ArrowRight className="w-4 h-4" />
          </a>
        ) : !here && place ? (
          <button
            onClick={() => navigate(place.path)}
            className="mt-3 w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-soft text-white text-sm font-medium hover:opacity-90 transition-opacity"
          >
            {text.go} <ArrowRight className="w-4 h-4" />
          </button>
        ) : null}

        {place?.kind === 'participant-page' && (
          <p className="text-xs text-gray-500 mt-2">You leave your own side for a moment. After handing in, a button brings you back here.</p>
        )}
        <button onClick={putAway} className="mt-3 w-full text-xs text-gray-500 hover:text-gray-800">
          Put the guide away
        </button>
      </div>

      {here && !blocked && target && <Spotlight selector={target} label={shown === 'MEET' ? undefined : 'Here'} />}
    </>
  );
}
