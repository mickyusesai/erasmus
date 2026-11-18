import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import toast from 'react-hot-toast';
import { FlaskConical, RotateCcw, ChevronDown } from 'lucide-react';
import { organisationApi } from '../../services/api';
import { enterTestAccount, inTestAccount } from '../../utils/testAccount';

/**
 * A small control in the corner while the onboarding test account is open (super-admin only):
 * says that this is the test account and starts it over as a brand-new organisation.
 * It is not part of what a real organisation sees.
 */
export function TestAccountBar() {
  const location = useLocation();
  const [active, setActive] = useState(inTestAccount);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setActive(inTestAccount());
    setOpen(false);
  }, [location.pathname]);

  if (!active || !location.pathname.startsWith('/org')) return null;

  const startOver = async (credits: number) => {
    setBusy(true);
    try {
      const login = await organisationApi.restartTestAccount(credits);
      enterTestAccount(login);
      // A full page load, so nothing of the previous run is left in memory
      window.location.assign('/org/dashboard');
    } catch (err) {
      setBusy(false);
      toast.error(err instanceof Error && err.message ? err.message : 'Could not start over');
    }
  };

  return (
    <div className="fixed bottom-4 left-4 z-[60] text-sm print:hidden">
      {open && (
        <div className="mb-2 w-72 rounded-xl bg-gray-900 text-white shadow-2xl border border-gray-700 p-3 space-y-2">
          <p className="text-xs text-gray-300 leading-relaxed">
            Start over deletes everything in this test account and opens it again as an organisation that signed up this second.
          </p>
          <button
            onClick={() => startOver(0)}
            disabled={busy}
            className="w-full text-left px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 disabled:opacity-50"
          >
            <span className="font-medium">Brand new</span>
            <span className="block text-xs text-gray-400">No credits, like a real new organisation</span>
          </button>
          <button
            onClick={() => startOver(1)}
            disabled={busy}
            className="w-full text-left px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 disabled:opacity-50"
          >
            <span className="font-medium">Brand new, with 1 project credit</span>
            <span className="block text-xs text-gray-400">To also try creating a real project</span>
          </button>
          {busy && <p className="text-xs text-gray-400">Starting over…</p>}
        </div>
      )}
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 pl-3 pr-2.5 py-2 rounded-full bg-gray-900 text-white shadow-lg border border-gray-700 hover:bg-gray-800"
        title="You are in the onboarding test account"
      >
        <FlaskConical className="w-4 h-4 text-amber-300" />
        <span className="font-medium">Test account</span>
        <span className="flex items-center gap-1 pl-2 border-l border-gray-700 text-gray-300">
          <RotateCcw className="w-3.5 h-3.5" />
          Start over
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>
    </div>
  );
}
