/* Signed out while a page was open (UI_V2: /start and every app page, first in <head>, services/ui-v2.js).
 *
 * A deploy that loses sessions, an expired cookie or a sign-out in another tab leaves the page thinking it is signed in. Its next call then gets a signed-out reply:
 * a 401, or in the private beta the sign-up refusal (middleware/signin-only.js CLOSED, `beta: 'closed'`; middleware/beta-gate.js `beta: 'not_invited'`), whose words,
 * "not taking new accounts", are wrong for someone who has an account; on /api/ob2/* it is a 409 `not_in_flow`. So: once the page has seen this visitor signed in (GET /api/auth/me with a user, or
 * GET /api/ob2/state for an account), any such reply is checked with GET /api/auth/me, and if nobody is signed in the page goes to /login?next=<this page>&why=signed_out,
 * where the sign-in page says "You were signed out. Sign in to carry on." The call that hit it never settles, so the page shows nothing about new accounts.
 *
 * A 401 for a wrong password (profile, parent pages) is not a sign-out: the check with /api/auth/me still finds the account, and the reply goes through untouched.
 * Sign-in and sign-up calls themselves are left alone.
 */
(function () {
  if (window.__u2SignedOut || !window.fetch) return;
  window.__u2SignedOut = true;
  const raw = window.fetch.bind(window);
  let signedIn = false;
  let leaving = false;
  const CLOSED = ['closed', 'not_invited'];

  function pathOf(input) {
    try {
      const u = new URL(typeof input === 'string' ? input : (input && input.url) || String(input), location.href);
      return u.origin === location.origin ? u.pathname : null;
    } catch (e) { return null; }
  }
  const body = (res) => res.clone().json().catch(() => null);

  /** Nobody signed in, as the server sees it now. */
  async function goneNow() {
    try {
      const res = await raw('/api/auth/me', { credentials: 'same-origin', cache: 'no-store' });
      const d = await res.json().catch(() => null);
      return res.ok && d && !d.user;
    } catch (e) { return false; } // offline is not signed out
  }

  function leave() {
    if (leaving) return new Promise(() => {});
    leaving = true;
    const here = location.pathname + location.search + location.hash;
    location.replace(`/login?next=${encodeURIComponent(here)}&why=signed_out`);
    return new Promise(() => {}); // the page is going: the call that hit it never settles
  }

  window.fetch = async function fetchWatched(input, init) {
    const res = await raw(input, init);
    const p = pathOf(input);
    if (!p || !p.startsWith('/api/') || leaving) return res;
    if (p === '/api/auth/me' || p === '/api/ob2/state') {
      const d = await body(res);
      const account = !!(d && (p === '/api/auth/me' ? d.user && !d.user.guest : d.account));
      if (account) signedIn = true;
      else if (signedIn && d && (p === '/api/auth/me' ? d.user === null : d.signed_out)) return leave();
      return res;
    }
    if (!signedIn || p.startsWith('/api/auth/')) return res;
    // 401; the beta's refusal (403); and /api/ob2's "only for a learner setting up" (409 not_in_flow), which is what a lost session gets there.
    if (res.status !== 401 && res.status !== 403 && res.status !== 409) return res;
    if (res.status !== 401) {
      const d = await body(res);
      if (!d || !(CLOSED.includes(d.beta) || d.code === 'not_in_flow')) return res;
    }
    return (await goneNow()) ? leave() : res;
  };
  window.U2SignedOut = { get signedIn() { return signedIn; } };
}());
