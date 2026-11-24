import { ArrowRight, GraduationCap, Play } from 'lucide-react';
import type { NextStep } from '../../utils/gettingStarted';

/**
 * The first thing a new organisation sees: three ways in, and nothing to read first. It
 * replaces the five slides of text. Whatever is chosen, the welcome is remembered as seen on
 * the server.
 */
export function WelcomeScreen({
  organisationName,
  step,
  onPractice,
  practiceOpening,
  onStart,
  onWatchFilm,
  onLookAround,
}: {
  organisationName: string;
  /** The first step of this organisation's own set-up (its words depend on what it already has) */
  step: NextStep;
  /** Open the practice project: a made-up exchange to try everything with */
  onPractice: () => void;
  practiceOpening?: boolean;
  onStart: () => void;
  onWatchFilm: () => void;
  onLookAround: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[60] bg-gray-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn overflow-y-auto">
      <div className="w-full max-w-5xl bg-white rounded-3xl shadow-elevated p-6 sm:p-10 my-auto" role="dialog" aria-modal="true" aria-labelledby="welcome-title">
        <p className="text-sm font-medium text-primary-600">Welcome, {organisationName}</p>
        <h1 id="welcome-title" className="text-2xl sm:text-3xl font-bold text-gray-900 mt-1">
          Let's get your first reimbursement done
        </h1>
        <p className="text-gray-600 mt-2">
          Your participants photograph their tickets, the AI turns them into checked trips, and you approve and pay.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8">
          <div className="rounded-2xl p-[2px] bg-gradient-soft">
            <div className="h-full bg-white rounded-[14px] p-5 flex flex-col">
              <p className="text-xs font-semibold uppercase tracking-wide text-primary-600">2 minutes · nothing is real</p>
              <h2 className="text-lg font-semibold text-gray-900 mt-1">See how it works</h2>
              <p className="text-sm text-gray-600 mt-1 flex-1">
                Try it in a practice project with made-up participants: approve one, ask one a question, and be a participant yourself.
              </p>
              <button
                onClick={onPractice}
                disabled={practiceOpening}
                className="mt-4 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-soft text-white font-medium hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-70"
              >
                <GraduationCap className="w-4 h-4" /> {practiceOpening ? 'Setting it up…' : 'Open the practice project'}
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 p-5 flex flex-col">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{step.total} short steps</p>
            <h2 className="text-lg font-semibold text-gray-900 mt-1">{step.title}</h2>
            <p className="text-sm text-gray-600 mt-1 flex-1">{step.text}</p>
            <button
              onClick={onStart}
              className="mt-4 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gray-900 text-white font-medium hover:bg-gray-800 active:scale-[0.98] transition-all"
            >
              {step.button} <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          <div className="rounded-2xl border border-gray-200 p-5 flex flex-col">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">35 seconds</p>
            <h2 className="text-lg font-semibold text-gray-900 mt-1">Watch how it works</h2>
            <p className="text-sm text-gray-600 mt-1 flex-1">From a pile of tickets to a paid participant.</p>
            <button
              onClick={onWatchFilm}
              className="mt-4 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gray-100 text-gray-800 font-medium hover:bg-gray-200 active:scale-[0.98] transition-all"
            >
              <Play className="w-4 h-4" /> Watch the film
            </button>
          </div>
        </div>

        <div className="mt-6 text-center">
          <button onClick={onLookAround} className="text-sm text-gray-500 hover:text-gray-800 underline underline-offset-2">
            I'll look around on my own
          </button>
        </div>
      </div>
    </div>
  );
}
