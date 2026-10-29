import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * Landing page for a support session opened from super-admin: stores the short-lived
 * organisation token (passed in the URL fragment, never sent to the server) and opens
 * the organisation's dashboard.
 */
export default function SupportSession() {
  const navigate = useNavigate();
  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const token = params.get('token');
    const orgId = params.get('org');
    if (!token || !orgId) {
      navigate('/org/login', { replace: true });
      return;
    }
    const minutes = Number(params.get('minutes') || 120);
    localStorage.setItem('org-token', token);
    localStorage.setItem('org-id', orgId);
    localStorage.setItem(`org-onboarding-${orgId}`, 'done');
    localStorage.setItem(
      'org-support',
      JSON.stringify({ name: params.get('name') || 'this organisation', expiresAt: Date.now() + minutes * 60 * 1000 })
    );
    window.history.replaceState(null, '', '/org/dashboard');
    navigate('/org/dashboard', { replace: true });
  }, [navigate]);
  return <p className="p-8 text-gray-500">Opening the dashboard…</p>;
}
