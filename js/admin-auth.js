/* Admin authentication (demo — client-side only) */
window.HenreiyaAuth = (function () {
  'use strict';

  const SESSION_KEY = 'henreiya_admin_session';
  /* パスワードは js/local-config.js に置く。このファイルには書かない。 */
  const secret = window.HenreiyaAdminSecret || {};
  const DEMO_USER = secret.user || 'admin';
  const DEMO_PASS = secret.pass || '';

  function isLoggedIn() {
    try {
      const s = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
      return !!(s && s.user === DEMO_USER && s.at);
    } catch {
      return false;
    }
  }

  function login(user, pass) {
    if (user === DEMO_USER && pass === DEMO_PASS) {
      sessionStorage.setItem(
        SESSION_KEY,
        JSON.stringify({ user: DEMO_USER, at: Date.now() })
      );
      return true;
    }
    return false;
  }

  function logout() {
    sessionStorage.removeItem(SESSION_KEY);
  }

  function requireAuth() {
    if (!isLoggedIn()) {
      const next = encodeURIComponent(location.pathname.split('/').pop() || 'index.html');
      location.href = 'login.html?next=' + next;
      return false;
    }
    return true;
  }

  function currentUser() {
    try {
      const s = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
      return s && s.user ? s.user : null;
    } catch {
      return null;
    }
  }

  return { isLoggedIn, login, logout, requireAuth, currentUser, DEMO_USER };
})();
