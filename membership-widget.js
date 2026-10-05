(() => {
  'use strict';

  const GOOGLE_CLIENT_ID = '559524100347-3hiiar1bmlcqbtb4q0adlahgojjfslj5.apps.googleusercontent.com';
  const AUTH_SRC = './google-auth-client.js';
  const SALES_ENABLED = true;

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
    const heroMobileStyle = document.createElement('style');
    heroMobileStyle.textContent = '@media(max-width:720px){.hero-photo{background-position:100% center!important;background-repeat:no-repeat!important}.hero-content>p{max-width:230px!important}}';
    document.head.appendChild(heroMobileStyle);

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
      #poConfirm{margin-top:18px;padding:18px;background:#fff;border:1px solid #ded8c9;border-radius:14px}
      #poConfirm h3{margin:0 0 12px;font-size:19px}
      #poConfirm dl{display:grid;grid-template-columns:auto 1fr;gap:8px 14px;margin:0 0 14px;font-size:14px}
      #poConfirm dt{font-weight:700}#poConfirm dd{margin:0}
      #poConfirm .po-legal{font-size:13px;line-height:1.7;margin:12px 0}
      #poConfirm .po-confirm-actions{display:grid;gap:10px}
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
        <div id="poConfirm" hidden aria-live="polite">
          <h3>お申し込み内容の最終確認</h3>
          <dl>
            <dt>プラン</dt><dd id="poConfirmPlan"></dd>
            <dt>料金</dt><dd id="poConfirmPrice"></dd>
            <dt>自動更新</dt><dd id="poConfirmCycle"></dd>
            <dt>提供開始</dt><dd>決済完了後</dd>
            <dt>解約</dt><dd>次回更新日前までに契約管理画面から次回更新を停止</dd>
            <dt>解約後</dt><dd>支払済み期間の末日まで利用可能</dd>
            <dt>途中解約の返金</dt><dd>なし（法令上必要な場合を除く）</dd>
          </dl>
          <p class="po-legal"><a href="terms.html" target="_blank" rel="noopener">利用規約</a> ／ <a href="tokusho.html" target="_blank" rel="noopener">特定商取引法に基づく表示</a> ／ <a href="privacy.html" target="_blank" rel="noopener">プライバシーポリシー</a></p>
          <div class="po-confirm-actions">
            <button id="poConfirmCheckout" class="po-buy">Stripeで申し込む</button>
            <button id="poConfirmBack" class="po-secondary">戻る</button>
          </div>
        </div>
        <button id="poPortalBtn" class="po-secondary" hidden>契約・お支払い管理</button>
        <button id="poLogoutBtn" class="po-secondary" hidden>ログアウト</button>
        <div id="poMemberResult"></div>
      </section>
    `;

    document.body.append(btn, shade);

    const statusEl = shade.querySelector('#poMemberStatus');
    const googleBtn = shade.querySelector('#poGoogleBtn');
    const purchase = shade.querySelector('#poPurchase');
    const preparing = shade.querySelector('#poPreparing');
    const confirmBox = shade.querySelector('#poConfirm');
    const confirmPlan = shade.querySelector('#poConfirmPlan');
    const confirmPrice = shade.querySelector('#poConfirmPrice');
    const confirmCycle = shade.querySelector('#poConfirmCycle');
    const confirmCheckout = shade.querySelector('#poConfirmCheckout');
    const confirmBack = shade.querySelector('#poConfirmBack');
    const portalBtn = shade.querySelector('#poPortalBtn');
    const logoutBtn = shade.querySelector('#poLogoutBtn');
    const result = shade.querySelector('#poMemberResult');

    function render(me) {
      window.dispatchEvent(new CustomEvent('placeoracle:auth', { detail: me || { authenticated:false } }));
      const authed = !!me?.authenticated;
      const active = authed && me.membership === 'active';
      btn.textContent = active ? '会員' : 'ログイン';
      btn.classList.toggle('po-active', active);
      googleBtn.style.display = authed ? 'none' : 'block';
      purchase.hidden = !SALES_ENABLED || !authed || active;
      preparing.hidden = SALES_ENABLED || !authed || active;
      portalBtn.hidden = !active;
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
    portalBtn.onclick = async () => {
      try {
        result.textContent = 'Stripeの契約管理画面を準備しています…';
        const data = await window.PlaceOracleAuth.createPortal();
        location.href = data.url;
      } catch (e) {
        result.textContent = e?.message || String(e);
      }
    };

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

    let pendingPlan = null;
    shade.querySelectorAll('[data-po-plan]').forEach(el => {
      el.onclick = () => {
        const yearly = el.dataset.poPlan === 'yearly';
        pendingPlan = el.dataset.poPlan;
        confirmPlan.textContent = yearly ? '年額プラン' : '月額プラン';
        confirmPrice.textContent = yearly ? '5,000円（税込）／年' : '500円（税込）／月';
        confirmCycle.textContent = yearly ? '1年ごと' : '1か月ごと';
        purchase.hidden = true;
        confirmBox.hidden = false;
        confirmCheckout.focus();
      };
    });

    confirmBack.onclick = () => {
      pendingPlan = null;
      confirmBox.hidden = true;
      purchase.hidden = !SALES_ENABLED;
    };

    confirmCheckout.onclick = async () => {
      if (!pendingPlan) return;
      try {
        result.textContent = 'Stripe Checkoutを準備しています…';
        confirmCheckout.disabled = true;
        const data = await window.PlaceOracleAuth.createCheckout(pendingPlan);
        location.href = data.url;
      } catch (e) {
        confirmCheckout.disabled = false;
        result.textContent = e?.message || String(e);
      }
    };

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
