import { Link } from 'react-router-dom';
import { ArrowRight, Check, Play } from 'lucide-react';
import { clsx } from 'clsx';
import type { GettingStarted } from '../../services/api';
import { STEP_LABELS, type NextStep } from '../../utils/gettingStarted';

/**
 * The dashboard of an organisation that has not sent its first invitations yet: one next
 * step with its button, and where that step sits among the others.
 */
export function NextStepCard({ step, progress, onWatchFilm }: { step: NextStep; progress: GettingStarted; onWatchFilm: () => void }) {
  return (
    <div className="rounded-2xl p-[2px] bg-gradient-soft shadow-sm">
      <div className="bg-white rounded-[14px] p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-5">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-primary-600">
              Next step · {step.number} of {step.total}
            </p>
            <h2 className="text-xl font-semibold text-gray-900 mt-1">{step.title}</h2>
            <p className="text-gray-600 mt-1">{step.text}</p>
          </div>
          <Link
            to={step.to}
            className="flex-shrink-0 inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-gradient-soft text-white font-medium hover:opacity-90 active:scale-[0.98] transition-all"
          >
            {step.button} <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        <div className="mt-5 pt-4 border-t border-gray-100 flex items-center justify-between gap-4 flex-wrap">
          <ol className="flex items-center gap-x-5 gap-y-2 flex-wrap text-sm">
            {progress.steps.map((s) => (
              <li
                key={s.id}
                className={clsx(
                  'flex items-center gap-1.5',
                  s.done ? 'text-emerald-700' : s.id === step.step ? 'text-gray-900 font-medium' : 'text-gray-400'
                )}
              >
                <span
                  className={clsx(
                    'w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-semibold',
                    s.done ? 'bg-emerald-100' : s.id === step.step ? 'bg-primary-100 text-primary-700' : 'bg-gray-100'
                  )}
                >
                  {s.done ? <Check className="w-3 h-3" /> : progress.steps.indexOf(s) + 1}
                </span>
                {STEP_LABELS[s.id]}
              </li>
            ))}
          </ol>
          <button onClick={onWatchFilm} className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800">
            <Play className="w-3.5 h-3.5" /> Watch the 35-second film
          </button>
        </div>
      </div>
    </div>
  );
}
