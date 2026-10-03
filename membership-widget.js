(() => {
  'use strict';

  const GOOGLE_CLIENT_ID = '559524100347-3hiiar1bmlcqbtb4q0adlahgojjfslj5.apps.googleusercontent.com';
  const AUTH_SRC = './google-auth-client.js';
  const TEST_MODE = false;

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const existing = Array.from(document.scripts).find(s => s.src && s.src.endsWith(src.replace('./','/')));
      if (existing) {
        if (existing.dataset.loaded === '1') return resolve();
        existing.addEventListener('load', resolve, { once: true });
        existing.addEventListener('error', reject, { once: true });
        return;
      }
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = () => { s.dataset.loaded = '1'; resolve(); };
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  function addStyles() {
    const style = document.createElement('style');
    style.textContent = `
      #poMemberBtn{position:absolute;z-index:2147483000;top:18px;right:220px;border:1px solid rgba(255,255,255,.55);border-radius:999px;padding:10px 17px;background:rgba(17,44,59,.72);color:#fff;font:600 14px/1 system-ui,-apple-system,"Segoe UI",sans-serif;backdrop-filter:blur(8px);cursor:pointer;box-shadow:0 4px 18px rgba(0,0,0,.16)}
      #poMemberBtn.po-active{border-color:#d6b45d;color:#fff7dc}
      #poMemberShade{display:none;position:fixed;z-index:2147483001;inset:0;background:rgba(7,25,35,.56);padding:24px;box-sizing:border-box}
      #poMemberShade.po-open{display:grid;place-items:center}
      #poMemberPanel{width:min(520px,100%);max-height:min(720px,calc(100vh - 48px));overflow:auto;border-radius:18px;background:#f7f3e8;color:#15313d;padding:28px;box-sizing:border-box;box-shadow:0 24px 70px rgba(0,0,0,.35);font-family:system-ui,-apple-system,"Segoe UI",sans-serif}
      #poMemberPanel [hidden]{display:none!important}
      #poMemberPanel .po-head{display:flex;justify-content:space-between;gap:18px;align-items:flex-start}
      #poMemberPanel .po-eyebrow{font-size:12px;letter-spacing:.18em;color:#9a771c;font-weight:700}
      #poMemberPanel h2{font-family:serif;font-size:26px;line-height:1.3;margin:6px 0 10px}
      #poMemberPanel .po-close{border:0;background:transparent;font-size:28px;cursor:pointer;color:#15313d}
      #poMemberPanel .po-status{padding:14px 16px;background:#fff;border:1px solid #ded8c9;border-radius:12px;margin:16px 0}
      #poMemberPanel .po-actions{display:grid;gap:10px;margin-top:18px}
      #poMemberPanel .po-buy,#poMemberPanel .po-secondary{border-radius:999px;padding:13px 18px;font-weight:700;cursor:pointer}
      #poMemberPanel .po-buy{border:0;background:#174e64;color:#fff}
      #poMemberPanel .po-secondary{border:1px solid #174e64;background:transparent;color:#174e64}
      #poGoogleBtn{margin:18px 0}
      #poMemberResult{white-space:pre-wrap;word-break:break-word;font-size:12px;margin-top:12px;color:#7a2f22}
      @media(max-width:700px){#poMemberBtn{top:62px;right:14px;padding:9px 13px;font-size:13px}#poMemberShade{padding:12px}#poMemberPanel{padding:22px}}
    `;
    document.head.appendChild(style);
  }

  function buildUI() {
    addStyles();

    const btn = document.createElement('button');
    btn.id = 'poMemberBtn';
    btn.type = 'button';
    btn.textContent = 'ログイン';

    const shade = document.createElement('div');
    shade.id = 'poMemberShade';
    shade.innerHTML = `
      <section id="poMemberPanel" role="dialog" aria-modal="true" aria-labelledby="poMemberTitle">
        <div class="po-head">
          <div>
            <div class="po-eyebrow">MEMBERSHIP</div>
            <h2 id="poMemberTitle">PLACE ORACLE<br>メンバーシップ</h2>
          </div>
          <button class="po-close" id="poMemberClose" aria-label="閉じる">×</button>
        </div>
        <div id="poMemberStatus" class="po-status">状態を確認しています…</div>
        <div id="poGoogleBtn"></div>
        <div id="poPurchase" class="po-actions" hidden>
          <button class="po-buy" data-po-plan="monthly">月額500円で利用する</button>
          <button class="po-secondary" data-po-plan="yearly">年額5,000円で利用する</button>
        </div>
        <div id="poPreparing" hidden>メンバーシップは現在準備中です。</div>
        <button id="poLogoutBtn" class="po-secondary" hidden>ログアウト</button>
        <div id="poMemberResult"></div>
      </section>
    `;

    document.body.append(btn, shade);

    const statusEl = shade.querySelector('#poMemberStatus');
    const googleBtn = shade.querySelector('#poGoogleBtn');
    const purchase = shade.querySelector('#poPurchase');
    const preparing = shade.querySelector('#poPreparing');
    const logoutBtn = shade.querySelector('#poLogoutBtn');
    const result = shade.querySelector('#poMemberResult');

    function render(me) {
      window.dispatchEvent(new CustomEvent('placeoracle:auth', { detail: me || { authenticated:false } }));
      const authed = !!me?.authenticated;
      const active = authed && me.membership === 'active';
      btn.textContent = active ? '会員' : 'ログイン';
      btn.classList.toggle('po-active', active);
      googleBtn.style.display = authed ? 'none' : 'block';
      purchase.hidden = !TEST_MODE || !authed || active;
      preparing.hidden = TEST_MODE || !authed || active;
      logoutBtn.hidden = !authed;

      if (!authed) statusEl.textContent = 'Googleでログインすると、メンバーシップを確認できます。';
      else if (active) statusEl.textContent = 'メンバーシップは有効です。';
      else statusEl.textContent = 'ログイン済み。現在、有効なメンバーシップはありません。';
    }

    async function refresh() {
      try {
        render(await window.PlaceOracleAuth.currentUser());
        result.textContent = '';
      } catch (e) {
        render({ authenticated: false });
        result.textContent = e?.message || String(e);
      }
    }

    function initGoogle() {
      if (!window.google?.accounts?.id) {
        setTimeout(initGoogle, 250);
        return;
      }
      google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: async r => {
          try {
            await window.PlaceOracleAuth.exchangeGoogleCredential(r.credential);
            result.textContent = '';
            await refresh();
          } catch (e) {
            result.textContent = e?.message || String(e);
          }
        }
      });
      google.accounts.id.renderButton(googleBtn, { theme: 'outline', size: 'large', text: 'signin_with' });
    }

    btn.onclick = () => { shade.classList.add('po-open'); refresh(); };
    shade.querySelector('#poMemberClose').onclick = () => shade.classList.remove('po-open');
    shade.addEventListener('click', e => { if (e.target === shade) shade.classList.remove('po-open'); });
    logoutBtn.onclick = async () => {
      try {
        await window.PlaceOracleAuth.logout();
      } finally {
        // Google Identity Services: prevent the previously used account from being auto-selected
        // on the next PLACE ORACLE login.
        if (window.google?.accounts?.id) {
          window.google.accounts.id.disableAutoSelect();
        }
        await refresh();
      }
    };

    shade.querySelectorAll('[data-po-plan]').forEach(el => {
      el.onclick = async () => {
        try {
          result.textContent = 'Stripe Checkoutを準備しています…';
          const data = await window.PlaceOracleAuth.createCheckout(el.dataset.poPlan);
          location.href = data.url;
        } catch (e) {
          result.textContent = e?.message || String(e);
        }
      };
    });

    initGoogle();
    refresh();
  }

  async function boot() {
    try {
      if (!window.PlaceOracleAuth) await loadScript(AUTH_SRC);
      if (!window.google?.accounts?.id) await loadScript('https://accounts.google.com/gsi/client');
      buildUI();
    } catch (e) {
      console.error('PLACE ORACLE membership UI failed to load', e);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
