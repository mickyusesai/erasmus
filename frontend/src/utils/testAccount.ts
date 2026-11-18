import type { TestAccountLogin } from '../services/api';

/**
 * The onboarding test account (opened from super-admin): which organisation in this browser
 * is the test account, and signing this browser in to a freshly started one.
 */
const KEY = 'org-test-account';

/** True while this browser is signed in to the onboarding test account */
export function inTestAccount(): boolean {
  try {
    const orgId = localStorage.getItem('org-id');
    return !!orgId && !!localStorage.getItem('org-token') && localStorage.getItem(KEY) === orgId;
  } catch {
    return false;
  }
}

/** Sign this browser in to the test account, exactly as the login page does for a real organisation */
export function enterTestAccount(login: Pick<TestAccountLogin, 'token'> & { organisation: { id: string } }) {
  localStorage.setItem('org-token', login.token);
  localStorage.setItem('org-id', login.organisation.id);
  localStorage.setItem(KEY, login.organisation.id);
  // Not a support session: no banner, and changes are logged as the organisation's own
  localStorage.removeItem('org-support');
}

/** The link that signs a browser tab in to the test account (the token stays in the fragment, never sent to a server) */
export function testAccountLink(login: TestAccountLogin): string {
  const hash = new URLSearchParams({ token: login.token, org: login.organisation.id });
  return `/org/test-account#${hash.toString()}`;
}
