import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { LifeBuoy } from 'lucide-react';

interface SupportSessionInfo {
  name: string;
  expiresAt: number;
}

function readSession(): SupportSessionInfo | null {
  try {
    const raw = localStorage.getItem('org-support');
    if (!raw || !localStorage.getItem('org-token')) return null;
    const session = JSON.parse(raw) as SupportSessionInfo;
    return session.expiresAt > Date.now() ? session : null;
  } catch {
    return null;
  }
}

/** A banner on organisation pages while EasyReimburse support is using an organisation's dashboard */
export function SupportSessionBanner() {
  const location = useLocation();
  const [session, setSession] = useState<SupportSessionInfo | null>(readSession);
  useEffect(() => setSession(readSession()), [location.pathname]);

  if (!session || !location.pathname.startsWith('/org')) return null;

  const end = () => {
    localStorage.removeItem('org-token');
    localStorage.removeItem('org-id');
    localStorage.removeItem('org-support');
    setSession(null);
    window.location.href = '/super-admin/dashboard';
  };

  return (
    <div className="sticky top-0 z-50 bg-amber-400 text-amber-950 text-sm">
      <div className="max-w-7xl mx-auto px-4 py-2 flex items-center gap-3 flex-wrap">
        <LifeBuoy className="w-4 h-4 flex-shrink-0" />
        <span className="flex-1 min-w-0">
          <strong>Support session:</strong> you are using the dashboard of {session.name}. Your changes are logged as SUPPORT. Ends at{' '}
          {new Date(session.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.
        </span>
        <button onClick={end} className="px-3 py-1 rounded-md bg-amber-950/10 hover:bg-amber-950/20 font-medium">
          End support session
        </button>
      </div>
    </div>
  );
}
