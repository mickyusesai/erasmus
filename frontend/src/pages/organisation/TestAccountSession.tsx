import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { enterTestAccount } from '../../utils/testAccount';

/**
 * Landing page for the onboarding test account opened from super-admin: signs this tab in
 * (the login arrives in the URL fragment, never sent to the server) and opens the dashboard,
 * where a new organisation starts.
 */
export default function TestAccountSession() {
  const navigate = useNavigate();
  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const token = params.get('token');
    const orgId = params.get('org');
    if (!token || !orgId) {
      navigate('/org/login', { replace: true });
      return;
    }
    enterTestAccount({ token, organisation: { id: orgId } });
    window.history.replaceState(null, '', '/org/dashboard');
    navigate('/org/dashboard', { replace: true });
  }, [navigate]);
  return <p className="p-8 text-gray-500">Opening the test account…</p>;
}
