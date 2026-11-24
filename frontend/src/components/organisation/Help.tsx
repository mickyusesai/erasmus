import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronDown, GraduationCap, LifeBuoy, Play, Send, X } from 'lucide-react';
import { clsx } from 'clsx';
import toast from 'react-hot-toast';
import { organisationApi } from '../../services/api';
import { inTestAccount } from '../../utils/testAccount';
import { Button } from '../ui/Button';
import { FilmModal } from './FilmModal';
import { useOpenPractice } from './PracticeCard';
import { usePractice } from './PracticeGuidePanel';

/** Short answers to what organisers ask most, each saying where in the app it is done */
export const HELP_ANSWERS: { question: string; answer: string }[] = [
  {
    question: 'How do I add my participants?',
    answer:
      'Open your project and choose "Paste a list": copy the rows straight from your sheet (name, email, sending country). You can also add one by hand or import a CSV file. Nobody gets an email until you send the invitations.',
  },
  {
    question: 'How do participants get in?',
    answer:
      'Each participant gets an email with a personal link. They need no account and no password. You send the links from the list of participants, or plan them for a day in the set-up of your project.',
  },
  {
    question: 'Where do I set what they can get back?',
    answer:
      'In the Settings of your project: one maximum amount per sending country, as in your grant agreement. One participant can get a maximum of their own on their page.',
  },
  {
    question: 'When does the AI build the trips?',
    answer:
      'Participants can upload tickets at any time. The AI turns them into trips once the project has ended, when the return tickets are in too. You can open it earlier in Settings, under "Rules for trips and declarations".',
  },
  {
    question: 'What do I do with what a participant handed in?',
    answer:
      'Open the participant: you see the trips, the tickets and what the AI check found. Approve it, or reopen it with a message when something is missing. When you have paid, mark it as paid.',
  },
  {
    question: 'How does green travel work?',
    answer:
      'Mark a sending country, or one participant, as green travel in Settings: they get the higher maximum. Food and accommodation for the extra travel days are added on the participant\'s page.',
  },
  {
    question: 'What do I keep for an audit?',
    answer:
      'For every approved participant there is one audit PDF with the trips, the amounts and all tickets. Download them one by one on the participant\'s page, or all at once with "Download Audit ZIPs" on the project page.',
  },
  {
    question: 'What does it cost?',
    answer:
      'Your first project is free for up to 10 participants. After that, one project credit covers a project with up to 60 participants. Credits and prices are on the Billing page.',
  },
];

let openPanel: (() => void) | null = null;

/** Opens Help from anywhere in the organiser's app (e.g. the link in the dashboard's header) */
export function openHelp(): void {
  openPanel?.();
}

/** The pages of the organiser's app where somebody is signed in and Help makes sense */
function helpBelongsOn(pathname: string): boolean {
  if (!pathname.startsWith('/org/')) return false;
  return !['/org/login', '/org/register', '/org/forgot-password', '/org/reset-password', '/org/support-session', '/org/test-account'].some((p) =>
    pathname.startsWith(p)
  );
}

/**
 * Help for organisers, on every page of their app: a button in the corner that opens the
 * practice project, the film, short answers, and a way to write to Micky. Mounted once.
 */
export function HelpButton() {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [film, setFilm] = useState(false);

  useEffect(() => {
    openPanel = () => setOpen(true);
    return () => {
      openPanel = null;
    };
  }, []);
  useEffect(() => setOpen(false), [location.pathname]);

  if (!helpBelongsOn(location.pathname) || !localStorage.getItem('org-token')) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={clsx(
          'fixed left-4 z-30 inline-flex items-center gap-2 px-3.5 py-2 rounded-full bg-white border border-gray-200 shadow-card text-sm font-medium text-gray-700 hover:bg-gray-50 hover:text-gray-900 transition-colors print:hidden',
          // The onboarding test account has its own control in this corner
          inTestAccount() ? 'bottom-16' : 'bottom-4'
        )}
        data-help-button
      >
        <LifeBuoy className="w-4 h-4 text-primary-600" />
        Help
      </button>
      {open && <HelpPanel onClose={() => setOpen(false)} onWatchFilm={() => setFilm(true)} />}
      {film && <FilmModal onClose={() => setFilm(false)} />}
    </>
  );
}

function HelpPanel({ onClose, onWatchFilm }: { onClose: () => void; onWatchFilm: () => void }) {
  const queryClient = useQueryClient();
  const { dashboard, practice } = usePractice();
  const practiceProject = useOpenPractice();
  const [answer, setAnswer] = useState<number | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const openPractice = async () => {
    // Whoever asks for the practice again gets its guide back too
    if (practice?.guide.closed) {
      await organisationApi.setPracticeGuideClosed(false).catch(() => undefined);
      queryClient.invalidateQueries({ queryKey: ['org-dashboard'] });
    }
    if (await practiceProject.open(practice?.projectId)) onClose();
  };

  return (
    <div className="fixed inset-0 z-[65] print:hidden" role="dialog" aria-modal="true" aria-labelledby="help-title">
      <div className="absolute inset-0 bg-gray-900/40 animate-fadeIn" onClick={onClose} />
      <div className="absolute inset-y-0 left-0 w-full max-w-md bg-white shadow-elevated flex flex-col animate-fadeIn">
        <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-gray-100">
          <h2 id="help-title" className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <LifeBuoy className="w-5 h-5 text-primary-600" /> Help
          </h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors" aria-label="Close help">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-8">
          <section>
            <h3 className="text-sm font-semibold text-gray-900">See how it works</h3>
            <div className="mt-3 grid grid-cols-1 gap-2">
              <button
                onClick={openPractice}
                disabled={practiceProject.opening}
                className="flex items-start gap-3 p-3 rounded-xl border border-gray-200 hover:border-primary-300 hover:bg-primary-50/40 text-left transition-colors disabled:opacity-60"
              >
                <GraduationCap className="w-5 h-5 text-primary-600 flex-shrink-0 mt-0.5" />
                <span>
                  <span className="block font-medium text-gray-900">{practiceProject.opening ? 'Setting it up…' : 'Try it in the practice project'}</span>
                  <span className="block text-sm text-gray-600">Made-up participants and sample tickets, with a guide in five steps. Nothing in it is real.</span>
                </span>
              </button>
              <button
                onClick={onWatchFilm}
                className="flex items-start gap-3 p-3 rounded-xl border border-gray-200 hover:border-primary-300 hover:bg-primary-50/40 text-left transition-colors"
              >
                <Play className="w-5 h-5 text-primary-600 flex-shrink-0 mt-0.5" />
                <span>
                  <span className="block font-medium text-gray-900">Watch the film</span>
                  <span className="block text-sm text-gray-600">35 seconds: from a pile of tickets to a paid participant.</span>
                </span>
              </button>
            </div>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-gray-900">How do I…</h3>
            <div className="mt-3 divide-y divide-gray-100 border-y border-gray-100">
              {HELP_ANSWERS.map((item, index) => (
                <div key={item.question}>
                  <button
                    type="button"
                    onClick={() => setAnswer(answer === index ? null : index)}
                    aria-expanded={answer === index}
                    className="w-full flex items-center justify-between gap-3 py-3 text-left text-sm font-medium text-gray-800 hover:text-gray-900"
                  >
                    {item.question}
                    <ChevronDown className={clsx('w-4 h-4 text-gray-400 flex-shrink-0 transition-transform', answer === index && 'rotate-180')} />
                  </button>
                  {answer === index && <p className="pb-3 text-sm text-gray-600">{item.answer}</p>}
                </div>
              ))}
            </div>
          </section>

          <WriteToMicky knownName={dashboard?.organisation.contactFirstName ?? ''} replyTo={dashboard?.organisation.email ?? ''} />
        </div>
      </div>
    </div>
  );
}

/** A question to Micky: it arrives in his inbox, and his answer in the organisation's own */
function WriteToMicky({ knownName, replyTo }: { knownName: string; replyTo: string }) {
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  useEffect(() => {
    if (knownName) setName((current) => current || knownName);
  }, [knownName]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sending || message.trim().length < 5) return;
    setSending(true);
    try {
      const result = await organisationApi.sendHelpMessage({ message: message.trim(), name: name.trim() || undefined, page: window.location.pathname });
      setSentTo(result.replyTo);
      setMessage('');
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : 'Your message could not be sent', { duration: 8000 });
    } finally {
      setSending(false);
    }
  };

  return (
    <section data-write-to-micky>
      <h3 className="text-sm font-semibold text-gray-900">Write to Micky</h3>
      <p className="text-sm text-gray-600 mt-1">
        Not in the answers above, or something not working? Micky built EasyReimburse and answers himself, by email{replyTo ? ` to ${replyTo}` : ''}.
      </p>
      {sentTo ? (
        <div className="mt-3 p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-900">
          <p className="font-medium">Your message is on its way.</p>
          <p className="mt-1">The answer comes by email, to {sentTo}.</p>
          <button type="button" onClick={() => setSentTo(null)} className="mt-2 underline font-medium">
            Write another message
          </button>
        </div>
      ) : (
        <form onSubmit={send} className="mt-3 space-y-3">
          <label className="block">
            <span className="block text-sm font-medium text-gray-700 mb-1">Your name</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              autoComplete="given-name"
              className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </label>
          <label className="block">
            <span className="block text-sm font-medium text-gray-700 mb-1">Your question</span>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={5}
              maxLength={4000}
              required
              placeholder="What would you like to know, or what is not working?"
              className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </label>
          <div className="flex justify-end">
            <Button type="submit" loading={sending} disabled={message.trim().length < 5}>
              <Send className="w-4 h-4 mr-2" /> Send to Micky
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
