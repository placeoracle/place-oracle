(() => {
  'use strict';

  const WORKER_BASE = 'https://place-oracle-billing.place-oracle-info.workers.dev';
  const TOKEN_KEY = 'place_oracle_session_token';
  const EMAIL_KEY = 'place_oracle_session_email';

  async function api(path, options = {}) {
    const token = localStorage.getItem(TOKEN_KEY);
    const headers = new Headers(options.headers || {});
    if (token) headers.set('Authorization', 'Bearer ' + token);
    const res = await fetch(WORKER_BASE + path, {
      ...options,
      headers,
      mode: 'cors'
    });
    let body = null;
    try { body = await res.json(); } catch (_) {}
    if (!res.ok) {
      const err = new Error((body && body.error) || ('HTTP ' + res.status));
      err.status = res.status;
      err.body = body;
      throw err;
    }
    return body;
  }

  async function exchangeGoogleCredential(credential) {
    const data = await api('/auth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential })
    });
    if (!data || !data.token) throw new Error('No session token returned');
    localStorage.setItem(TOKEN_KEY, data.token);
    if (data.email) localStorage.setItem(EMAIL_KEY, data.email);
    return data;
  }

  async function currentUser() {
    try {
      return await api('/auth/me', { method: 'GET' });
    } catch (err) {
      if (err.status === 401) return { authenticated: false };
      throw err;
    }
  }

  async function createCheckout(plan) {
    const data = await api('/checkout/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan })
    });
    if (!data || !data.url) throw new Error('No Checkout URL returned');
    return data;
  }

  async function createPortal() {
    const data = await api('/portal/create', { method: 'POST' });
    if (!data || !data.url) throw new Error('No Portal URL returned');
    return data;
  }

  async function logout() {
    try {
      await api('/auth/logout', { method: 'POST' });
    } finally {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(EMAIL_KEY);
    }
  }

  function clearLocalSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(EMAIL_KEY);
  }

  window.PlaceOracleAuth = {
    WORKER_BASE,
    exchangeGoogleCredential,
    currentUser,
    createCheckout,
    createPortal,
    logout,
    clearLocalSession,
    get token() { return localStorage.getItem(TOKEN_KEY); },
    get email() { return localStorage.getItem(EMAIL_KEY); }
  };
})();
