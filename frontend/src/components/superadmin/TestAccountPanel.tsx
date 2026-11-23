import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { FlaskConical, Sparkles, ArrowUpRight, RotateCcw } from 'lucide-react';
import { superAdminApi, type TestAccountLogin } from '../../services/api';
import { testAccountLink } from '../../utils/testAccount';

/**
 * The onboarding test account: opens the app as an organisation that signed up this second,
 * as often as you like, without creating new accounts.
 */
export function TestAccountPanel() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['super-admin-test-account'], queryFn: superAdminApi.getTestAccount });

  const [email, setEmail] = useState('');
  const [credits, setCredits] = useState(0);
  const [sendWelcomeEmail, setSendWelcomeEmail] = useState(false);
  const [busy, setBusy] = useState<'start' | 'open' | null>(null);
  /** The link to the account that was just started or opened, in case the browser blocked the new tab */
  const [readyLink, setReadyLink] = useState<string | null>(null);

  useEffect(() => {
    if (data && !email) setEmail(data.suggestedEmail);
  }, [data, email]);

  // The new tab is opened straight from the click, so browsers don't treat it as a pop-up;
  // it gets its address once the account is ready.
  const run = async (kind: 'start' | 'open', action: () => Promise<TestAccountLogin>) => {
    const tab = window.open('', '_blank');
    setBusy(kind);
    setReadyLink(null);
    try {
      const login = await action();
      const link = testAccountLink(login);
      if (tab) tab.location.href = link;
      else setReadyLink(link);
      queryClient.invalidateQueries({ queryKey: ['super-admin-test-account'] });
      queryClient.invalidateQueries({ queryKey: ['super-admin-organisations'] });
    } catch (err) {
      tab?.close();
      toast.error(err instanceof Error && err.message ? err.message : 'Could not open the test account');
    } finally {
      setBusy(null);
    }
  };

  const account = data?.account;

  return (
    <div className="bg-gray-800 rounded-xl border border-gray-700 p-6 space-y-6 max-w-3xl">
      <div>
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <FlaskConical className="w-5 h-5 text-amber-300" /> Onboarding test account
        </h2>
        <p className="text-sm text-gray-400 mt-1 leading-relaxed">
          Opens the app as an organisation that signed up this second: the same welcome, the same free first project and nothing
          else. Every start throws the previous test account away with its projects, participants and files, so you can go through
          the first steps as often as you like. Real organisations are never touched.
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">Emails for the test organisation go to</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500"
            placeholder="you+onboarding-test@yourdomain.com"
          />
          <p className="text-xs text-gray-500 mt-1">
            What a new organisation would get by email arrives here. The part after the + keeps it apart from your real account and
            still lands in your own inbox at most mail providers.
          </p>
        </div>

        <div>
          <p className="text-sm font-medium text-gray-300 mb-2">Start with</p>
          <div className="grid sm:grid-cols-2 gap-2">
            {[
              { value: 0, title: 'No credits', text: 'What a real new organisation has' },
              { value: 1, title: '1 project credit', text: 'To also try creating a real project' },
            ].map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setCredits(option.value)}
                className={`text-left px-3 py-2.5 rounded-lg border transition-colors ${
                  credits === option.value ? 'border-indigo-500 bg-indigo-500/10' : 'border-gray-700 bg-gray-900 hover:border-gray-600'
                }`}
              >
                <span className="block text-sm font-medium text-white">{option.title}</span>
                <span className="block text-xs text-gray-400">{option.text}</span>
              </button>
            ))}
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
          <input type="checkbox" checked={sendWelcomeEmail} onChange={(e) => setSendWelcomeEmail(e.target.checked)} className="rounded" />
          Also send the welcome email a new organisation gets
        </label>

        <button
          onClick={() => run('start', () => superAdminApi.startTestAccount({ email: email.trim() || undefined, credits, sendWelcomeEmail }))}
          disabled={busy !== null || isLoading}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold disabled:opacity-50"
        >
          <Sparkles className="w-4 h-4" />
          {busy === 'start' ? 'Starting…' : 'Open as a brand-new organisation'}
        </button>
        {account && (
          <p className="text-xs text-amber-300/80 flex items-center gap-1.5">
            <RotateCcw className="w-3.5 h-3.5" /> This deletes the current test account below and everything in it.
          </p>
        )}
      </div>

      {readyLink && (
        <div className="p-4 rounded-lg bg-emerald-900/30 border border-emerald-700 text-sm text-emerald-100 flex items-center justify-between gap-3">
          <span>The test account is ready, but your browser kept the new tab from opening.</span>
          <a href={readyLink} target="_blank" rel="noreferrer" className="px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white font-medium whitespace-nowrap">
            Open it
          </a>
        </div>
      )}

      <div className="pt-5 border-t border-gray-700">
        <p className="text-sm font-medium text-gray-300 mb-2">Current test account</p>
        {isLoading ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : !account ? (
          <p className="text-sm text-gray-500">None yet. It is created the first time you open it.</p>
        ) : (
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <p className="text-sm text-gray-400">
              Started {new Date(account.createdAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })} ·{' '}
              {account.projects} project{account.projects === 1 ? '' : 's'} · {account.participants} participant
              {account.participants === 1 ? '' : 's'} · {account.projectCredits} credit{account.projectCredits === 1 ? '' : 's'}
              <span className="block text-xs text-gray-500">{account.email}</span>
            </p>
            <button
              onClick={() => run('open', superAdminApi.openTestAccount)}
              disabled={busy !== null}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium disabled:opacity-50"
            >
              <ArrowUpRight className="w-4 h-4" />
              {busy === 'open' ? 'Opening…' : 'Continue where it is'}
            </button>
          </div>
        )}
        <p className="text-xs text-gray-500 mt-3">
          Inside the test account, the “Test account” button in the bottom-left corner starts over without coming back here.
        </p>
      </div>
    </div>
  );
}
