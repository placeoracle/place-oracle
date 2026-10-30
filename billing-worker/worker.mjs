const GOOGLE_JWKS = 'https://www.googleapis.com/oauth2/v3/certs';
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
let jwksCache = { keys: [], until: 0 };

function b64url(bytes) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function decodeB64url(value) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Invalid token encoding');
  const raw = atob(value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4));
  return Uint8Array.from(raw, ch => ch.charCodeAt(0));
}
function json(response, status = 200, origin = '') {
  return new Response(JSON.stringify(response), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
      ...(origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' } : {}) }
  });
}
async function tokenHash(token) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return b64url(new Uint8Array(digest));
}
async function verifyGoogleToken(token, clientId) {
  if (typeof token !== 'string' || token.length > 8192) throw new Error('Invalid credential');
  const pieces = token.split('.');
  if (pieces.length !== 3) throw new Error('Invalid credential');
  const header = JSON.parse(new TextDecoder().decode(decodeB64url(pieces[0])));
  const claims = JSON.parse(new TextDecoder().decode(decodeB64url(pieces[1])));
  if (header.alg !== 'RS256' || typeof header.kid !== 'string') throw new Error('Invalid token algorithm');
  if (Date.now() >= jwksCache.until) {
    const response = await fetch(GOOGLE_JWKS);
    if (!response.ok) throw new Error('Could not load Google signing keys');
    const body = await response.json();
    if (!Array.isArray(body.keys)) throw new Error('Invalid signing keys');
    const maxAge = Number(response.headers.get('Cache-Control')?.match(/max-age=(\d+)/)?.[1] || 300);
    jwksCache = { keys: body.keys, until: Date.now() + Math.min(Math.max(maxAge, 60), 3600) * 1000 };
  }
  let jwk = jwksCache.keys.find(k => k.kid === header.kid && k.kty === 'RSA' && k.use === 'sig');
  if (!jwk) {
    jwksCache.until = 0;
    const response = await fetch(GOOGLE_JWKS);
    if (!response.ok) throw new Error('Could not refresh Google signing keys');
    const body = await response.json();
    jwksCache = { keys: body.keys || [], until: Date.now() + 300000 };
    jwk = jwksCache.keys.find(k => k.kid === header.kid && k.kty === 'RSA' && k.use === 'sig');
  }
  if (!jwk) throw new Error('Unknown signing key');
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, decodeB64url(pieces[2]),
    new TextEncoder().encode(pieces[0] + '.' + pieces[1]));
  if (!valid) throw new Error('Invalid signature');
  const now = Math.floor(Date.now() / 1000);
  if (claims.aud !== clientId || !['accounts.google.com', 'https://accounts.google.com'].includes(claims.iss)
    || !Number.isInteger(claims.exp) || claims.exp <= now
    || !Number.isInteger(claims.iat) || claims.iat > now + 120
    || typeof claims.sub !== 'string' || !claims.sub) throw new Error('Invalid token claims');
  return { sub: claims.sub, email: claims.email_verified === true ? claims.email : null };
}
function bearer(request) {
  const value = request.headers.get('Authorization') || '';
  return /^Bearer [A-Za-z0-9_-]{40,100}$/.test(value) ? value.slice(7) : null;
}
async function sessionUser(request, env) {
  const token = bearer(request);
  if (!token) return null;
  const hash = await tokenHash(token);
  const row = await env.DB.prepare(
    'SELECT u.google_sub, u.email FROM po_sessions s JOIN po_users u ON u.google_sub=s.google_sub WHERE s.token_hash=? AND s.expires_at>?'
  ).bind(hash, Date.now()).first();
  return row ? { ...row, hash } : null;
}


function diagnosisProfile(row) {
  return row?{birth:row.birth,birthPlace:JSON.parse(row.birth_place),corrections_used:row.corrections_used,version:row.version}:null;
}
async function getDiagnosisProfile(env,user) {
  return diagnosisProfile(await env.DB.prepare('SELECT birth,birth_place,corrections_used,version FROM po_diagnosis_profiles WHERE google_sub=?').bind(user.google_sub).first());
}
function validDiagnosisInput(body) {
  const birth=body.birth, p=body.birthPlace;
  if(typeof birth!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(birth)||!p||typeof p!=='object')return null;
  const [y,m,d]=birth.split('-').map(Number), date=new Date(Date.UTC(y,m-1,d));
  if(y<1900||y>new Date().getUTCFullYear()||date.getUTCFullYear()!==y||date.getUTCMonth()!==m-1||date.getUTCDate()!==d)return null;
  const prefs=['北海道','青森県','岩手県','宮城県','秋田県','山形県','福島県','茨城県','栃木県','群馬県','埼玉県','千葉県','東京都','神奈川県','新潟県','富山県','石川県','福井県','山梨県','長野県','岐阜県','静岡県','愛知県','三重県','滋賀県','京都府','大阪府','兵庫県','奈良県','和歌山県','鳥取県','島根県','岡山県','広島県','山口県','徳島県','香川県','愛媛県','高知県','福岡県','佐賀県','長崎県','熊本県','大分県','宮崎県','鹿児島県','沖縄県'];
  if(typeof p.code!=='string'||!/^\d{6}$/.test(p.code)||prefs[Number(p.code.slice(0,2))-1]!==p.prefecture||typeof p.municipality!=='string'||!p.municipality.trim()||p.municipality.length>50)return null;
  return {birth,birthPlace:{prefecture:p.prefecture,municipality:p.municipality.trim(),code:p.code}};
}
async function saveDiagnosisProfile(env,user,body) {
  const candidate=validDiagnosisInput(body);
  if(!candidate||body.confirmed!==true||!Number.isSafeInteger(body.expected_version)||body.expected_version<0)return {status:400,error:'確認した生年月日・出生地を入力してください。'};
  let old=await getDiagnosisProfile(env,user);
  if(!old){
    await env.DB.prepare('INSERT OR IGNORE INTO po_diagnosis_profiles(google_sub,birth,birth_place,corrections_used,version,updated_at) VALUES (?,?,?,0,1,?)')
      .bind(user.google_sub,candidate.birth,JSON.stringify(candidate.birthPlace),Date.now()).run();
    old=await getDiagnosisProfile(env,user);
  }
  if(old.birth===candidate.birth&&old.birthPlace.code===candidate.birthPlace.code)return {status:200,profile:old};
  if(old.corrections_used>=1)return {status:409,code:'profile_locked',error:'登録後の訂正は1回までです。別のGoogleアカウントで新規登録してください。',profile:old};
  if(old.version!==body.expected_version)return {status:409,code:'profile_stale',error:'登録内容が更新されています。確認し直してください。',profile:old};
  await env.DB.prepare('UPDATE po_diagnosis_profiles SET birth=?,birth_place=?,corrections_used=1,version=version+1,updated_at=? WHERE google_sub=? AND version=? AND corrections_used=0')
    .bind(candidate.birth,JSON.stringify(candidate.birthPlace),Date.now(),user.google_sub,body.expected_version).run();
  const saved=await getDiagnosisProfile(env,user);
  return saved.birth===candidate.birth&&saved.birthPlace.code===candidate.birthPlace.code
    ?{status:200,profile:saved}:{status:409,code:'profile_stale',error:'別の画面で訂正されています。確認し直してください。',profile:saved};
}

function hex(bytes) {
  return Array.from(new Uint8Array(bytes))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

async function verifyStripeWebhook(request, secret) {
  if (!secret) throw new Error('STRIPE_WEBHOOK_SECRET missing');

  const signature = request.headers.get('Stripe-Signature');
  if (!signature) throw new Error('Stripe-Signature missing');

  const rawBody = await request.text();

  let timestamp = null;
  const signatures = [];

  for (const part of signature.split(',')) {
    const pos = part.indexOf('=');
    if (pos < 0) continue;

    const key = part.slice(0, pos);
    const value = part.slice(pos + 1);

    if (key === 't') timestamp = value;
    if (key === 'v1') signatures.push(value);
  }

  if (!timestamp || signatures.length === 0) {
    throw new Error('Invalid Stripe signature header');
  }

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(timestamp)) > 300) {
    throw new Error('Stripe signature timestamp expired');
  }

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signedPayload = `${timestamp}.${rawBody}`;

  const digest = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(signedPayload)
  );

  const expected = hex(digest);

  if (!signatures.some(sig => sig === expected)) {
    throw new Error('Invalid Stripe signature');
  }

  return JSON.parse(rawBody);
}

function stripeId(value) {
  if (!value) return null;
  return typeof value === 'string' ? value : value.id || null;
}

async function saveSubscription(env, sub, eventCreated) {
  const item = sub.items?.data?.[0];

  const priceId =
    item?.price?.id ||
    item?.plan?.id ||
    null;

  const periodEnd =
    sub.current_period_end ??
    item?.current_period_end ??
    null;

  await env.DB.prepare(`
    INSERT INTO subscriptions (
      stripe_subscription_id,
      stripe_customer_id,
      customer_email,
      status,
      stripe_price_id,
      current_period_end,
      updated_at,
      stripe_event_created
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(stripe_subscription_id) DO UPDATE SET
      stripe_customer_id = excluded.stripe_customer_id,
      customer_email = COALESCE(
        excluded.customer_email,
        subscriptions.customer_email
      ),
      status = excluded.status,
      stripe_price_id = excluded.stripe_price_id,
      current_period_end = excluded.current_period_end,
      updated_at = excluded.updated_at,
      stripe_event_created = excluded.stripe_event_created
    WHERE subscriptions.stripe_event_created IS NULL
       OR excluded.stripe_event_created >= subscriptions.stripe_event_created
  `).bind(
    sub.id,
    stripeId(sub.customer),
    sub.customer_email || null,
    sub.status,
    priceId,
    periodEnd,
    Date.now(),
    eventCreated || 0
  ).run();
}

async function saveCheckoutSession(env, session) {
  if (session.mode !== 'subscription') return;

  const subscriptionId = stripeId(session.subscription);
  const customerId = stripeId(session.customer);

  if (!subscriptionId || !customerId) return;
  await env.DB.prepare("UPDATE po_checkout_orders SET status='paid' WHERE session_id=?").bind(session.id||'').run();

  const email =
    session.customer_details?.email ||
    session.customer_email ||
    null;

  await env.DB.prepare(`
    INSERT INTO subscriptions (
      stripe_subscription_id,
      stripe_customer_id,
      customer_email,
      status,
      stripe_price_id,
      current_period_end,
      updated_at
    )
    VALUES (?, ?, ?, 'pending', NULL, NULL, ?)
    ON CONFLICT(stripe_subscription_id) DO UPDATE SET
      stripe_customer_id = excluded.stripe_customer_id,
      customer_email = COALESCE(
        excluded.customer_email,
        subscriptions.customer_email
      ),
      updated_at = excluded.updated_at
  `).bind(
    subscriptionId,
    customerId,
    email,
    Date.now()
  ).run();
}

async function createCheckoutSession(env, user, plan, orderId) {
  const priceId = plan === 'monthly' ? env.STRIPE_PRICE_MONTHLY : plan==='yearly'?env.STRIPE_PRICE_YEARLY:env.STRIPE_PRICE_SINGLE;
  if (!['single','monthly','yearly'].includes(plan) || !priceId) throw new Error('Invalid plan');
  if (!env.STRIPE_SECRET_KEY) {
    throw new Error('STRIPE_SECRET_KEY missing');
  }

  const params = new URLSearchParams();

  params.set('mode', plan==='single'?'payment':'subscription');
  params.set('managed_payments[enabled]', 'false');
  params.set('integration_identifier','place_oracle_'+Array.from((orderId||'abcdefgh').slice(0,8),c=>String.fromCharCode(97+c.charCodeAt(0)%26)).join(''));
  if(plan==='single') {
    params.set('payment_intent_data[metadata][po_order]',orderId||'');
  }
  params.set('line_items[0][price]',priceId);
  params.set('line_items[0][quantity]', '1');

  params.set('customer_email', user.email);
  params.set('client_reference_id', user.google_sub);
  if(orderId)params.set('metadata[po_order]',orderId);

  if(plan!=='single') params.set('subscription_data[metadata][google_sub]',user.google_sub);

  params.set(
    'success_url',
    'https://placeoracle.github.io/place-oracle/?checkout=success'
  );

  params.set(
    'cancel_url',
    'https://placeoracle.github.io/place-oracle/?checkout=cancel'
  );

  const response = await fetch(
    'https://api.stripe.com/v1/checkout/sessions',
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.STRIPE_SECRET_KEY}`,
        'Stripe-Version':'2026-09-30.endive',
        'Content-Type': 'application/x-www-form-urlencoded',
        ...(orderId?{'Idempotency-Key':'po-'+orderId}:{})
      },
      body: params.toString()
    }
  );

  const data = await response.json();

  if (!response.ok) {
    console.error('Stripe Checkout error', data?.error?.code||'unknown');
    throw new Error(
      data?.error?.message || 'Could not create Stripe Checkout session'
    );
  }

  return data;
}

async function createPortalSession(env, customerId) {
  if (!env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY missing');
  const params = new URLSearchParams();
  params.set('customer', customerId);
  if (!env.STRIPE_PORTAL_CONFIGURATION) throw new Error('STRIPE_PORTAL_CONFIGURATION missing');
  params.set('configuration', env.STRIPE_PORTAL_CONFIGURATION);
  params.set('return_url', 'https://placeoracle.github.io/place-oracle/');
  const response = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: params.toString()
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message || 'Could not create billing portal session');
  return data;
}

// All paid use is accounted for on the primary database. Anonymous trials remain local.
function jstDay(now = Date.now()) { return new Date(now + 9 * 3600000).toISOString().slice(0, 10); }
// Only a verified session subject can match this server-side operator setting.
function hasTestAccess(env, user) {
  return typeof env.TEST_ACCOUNT_GOOGLE_SUB === 'string' && env.TEST_ACCOUNT_GOOGLE_SUB.length > 0
    && user.google_sub === env.TEST_ACCOUNT_GOOGLE_SUB;
}
async function paidMembership(env, user) {
  return env.DB.prepare(`SELECT * FROM subscriptions WHERE LOWER(customer_email)=LOWER(?)
    AND stripe_price_id IN (?,?) AND status='active' AND current_period_end>?
    AND NOT EXISTS (SELECT 1 FROM po_billing_holds b WHERE b.stripe_customer_id=subscriptions.stripe_customer_id)
    ORDER BY current_period_end DESC LIMIT 1`).bind(user.email, env.STRIPE_PRICE_MONTHLY,
      env.STRIPE_PRICE_YEARLY, Math.floor(Date.now()/1000)).first();
}
async function readingBalance(env, user) {
  const test = hasTestAccess(env,user);
  const member = test || await paidMembership(env, user);
  const used = await env.DB.prepare(`SELECT count(*) AS n FROM po_reading_history
    WHERE google_sub=? AND day=? AND kind='member'`).bind(user.google_sub,jstDay()).first();
  const credits = await env.DB.prepare(`SELECT count(*) AS n FROM po_reading_credits c
    WHERE c.google_sub=? AND c.status='paid' AND NOT EXISTS
    (SELECT 1 FROM po_reading_history h WHERE h.credit_session_id=c.session_id)`).bind(user.google_sub).first();
  const lastOrder=await env.DB.prepare('SELECT status FROM po_checkout_orders WHERE google_sub=? ORDER BY created_at DESC LIMIT 1').bind(user.google_sub).first();
  return { payment_state:lastOrder?.status||null, member:!!member, test_access:test, day:jstDay(), daily_limit:5, daily_used:used?.n||0,
    daily_remaining:member?Math.max(0,5-(used?.n||0)):0, credits:credits?.n||0 };
}
function safeReading(input) {
  // Only the delivered words/place/calendar are saved; never raw birth or location inputs.
  if(!input || typeof input!=='object') throw new Error('Invalid reading');
  const out={};
  for(const key of ['date','title','intro','sceneLine','heart','action']) {
    if(typeof input[key]!=='string' || input[key].length>6000) throw new Error('Invalid reading');
    out[key]=input[key];
  }
  for(const key of ['first','dailyCard'])if(typeof input[key]==='boolean')out[key]=input[key];
  if(typeof input.basis==='string')out.basis=input.basis.slice(0,1200);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(out.date)) throw new Error('Invalid reading');
  for(const key of ['place','scene','theme','cycle','sky']) {
    if(input[key] && typeof input[key]==='object') {
      out[key]={};
      const allowed=key==='place'?['id','name','country','region','fact','oracle','sceneLine','afterglow']:
        key==='cycle'?['precise','term','yearStar','monthStar','day']:key==='sky'?
        ['skyTitle','skyFact','loreEyebrow','loreTitle','lore','story','discovery','reflection','sources']:['name'];
      for(const field of allowed) {
        const value=input[key][field];
        if(value===undefined)continue;
        if(field==='day' && key==='cycle')out[key].day={label:String(value?.label||'').slice(0,40),index:Number.isInteger(value?.index)?value.index:0};
        else if(field==='sources' && Array.isArray(value))out[key].sources=value.filter(v=>typeof v==='string'&&v.startsWith('https://')).slice(0,12).map(v=>v.slice(0,500));
        else if(['string','number','boolean'].includes(typeof value))out[key][field]=typeof value==='string'?value.slice(0,6000):value;
      }
    }
  }
  if(!out.place?.id || !out.place?.name || !out.scene?.name || !out.theme?.name || !out.cycle?.day) throw new Error('Invalid reading');
  if(JSON.stringify(out).length>24000) throw new Error('Invalid reading');
  return out;
}
async function grantReading(env, user, id, snapshot) {
  const old=await env.DB.prepare('SELECT snapshot,kind FROM po_reading_history WHERE google_sub=? AND request_id=?')
    .bind(user.google_sub,id).first();
  if(old) return {ok:true,snapshot:JSON.parse(old.snapshot),kind:old.kind,replayed:true};
  const test=hasTestAccess(env,user), member=test||await paidMembership(env,user), day=jstDay(), now=Date.now();
  if(member) {
    await env.DB.prepare(`INSERT OR IGNORE INTO po_reading_history
      (google_sub,request_id,day,kind,credit_session_id,snapshot,created_at)
      SELECT ?,?,?,'member',NULL,?,? WHERE
      (?=1 OR EXISTS (SELECT 1 FROM subscriptions WHERE LOWER(customer_email)=LOWER(?)
       AND stripe_price_id IN (?,?) AND status='active' AND current_period_end>?
    AND NOT EXISTS (SELECT 1 FROM po_billing_holds b WHERE b.stripe_customer_id=subscriptions.stripe_customer_id)))
      AND (SELECT count(*) FROM po_reading_history WHERE google_sub=? AND day=? AND kind='member')<5`)
      .bind(user.google_sub,id,day,JSON.stringify(snapshot),now,test?1:0,user.email,env.STRIPE_PRICE_MONTHLY,
        env.STRIPE_PRICE_YEARLY,Math.floor(now/1000),user.google_sub,day).run();
  } else {
    await env.DB.prepare(`INSERT OR IGNORE INTO po_reading_history
      (google_sub,request_id,day,kind,credit_session_id,snapshot,created_at)
      SELECT ?,?,?,'single',c.session_id,?,? FROM po_reading_credits c
      WHERE c.google_sub=? AND c.status='paid' AND NOT EXISTS
      (SELECT 1 FROM po_reading_history h WHERE h.credit_session_id=c.session_id)
      ORDER BY c.created_at,c.session_id LIMIT 1`)
      .bind(user.google_sub,id,day,JSON.stringify(snapshot),now,user.google_sub).run();
  }
  const saved=await env.DB.prepare('SELECT snapshot,kind FROM po_reading_history WHERE google_sub=? AND request_id=?')
    .bind(user.google_sub,id).first();
  return saved?{ok:true,snapshot:JSON.parse(saved.snapshot),kind:saved.kind}:
    {ok:false,reason:member?'daily_limit':'payment_required'};
}
async function stripeRead(env,path) {
  const r=await fetch('https://api.stripe.com/v1/'+path,{headers:{Authorization:`Bearer ${env.STRIPE_SECRET_KEY}`}});
  if(!r.ok) throw new Error('Stripe lookup failed');
  return r.json();
}
async function fulfillSingle(env, session) {
  if(session.mode!=='payment' || session.payment_status!=='paid') return;
  const order=await env.DB.prepare('SELECT * FROM po_checkout_orders WHERE session_id=? AND plan=\'single\'').bind(session.id).first();
  if(!order){if(session.metadata?.po_order)throw new Error('Single-payment order not found');return;}
  if(session.amount_total!==100 || session.currency!=='jpy' || session.client_reference_id!==order.google_sub)
    throw new Error('Payment does not match order');
  await env.DB.batch([
    env.DB.prepare(`INSERT OR IGNORE INTO po_reading_credits
      (session_id,google_sub,payment_intent,status,created_at) SELECT ?,?,?,
       CASE WHEN EXISTS (SELECT 1 FROM po_revoked_payments WHERE payment_intent=?) THEN 'revoked' ELSE 'paid' END,?`)
      .bind(session.id,order.google_sub,stripeId(session.payment_intent),stripeId(session.payment_intent),Date.now()),
    env.DB.prepare("UPDATE po_checkout_orders SET status='paid',payment_intent=? WHERE session_id=?")
      .bind(stripeId(session.payment_intent),session.id)
  ]);
}
async function revokePayment(env, event) {
  let charge=event.data.object;
  if(charge.object!=='charge' && charge.charge) charge=await stripeRead(env,'charges/'+encodeURIComponent(stripeId(charge.charge)));
  const pi=stripeId(charge.payment_intent);
  if(pi) await env.DB.batch([
    env.DB.prepare('INSERT OR IGNORE INTO po_revoked_payments VALUES (?,?)').bind(pi,Date.now()),
    env.DB.prepare("UPDATE po_reading_credits SET status='revoked' WHERE payment_intent=?").bind(pi)
  ]);
  const customer=stripeId(charge.customer);
  if(customer) await env.DB.prepare('INSERT OR IGNORE INTO po_billing_holds VALUES (?,?,?)').bind(customer,event.type,Date.now()).run();
  // Resolve subscription through the charge/invoice graph, rather than trusting client metadata.
  if(charge.invoice) {
    const invoice=await stripeRead(env,'invoices/'+encodeURIComponent(stripeId(charge.invoice)));
    const sub=stripeId(invoice.subscription||invoice.parent?.subscription_details?.subscription);
    if(sub) await env.DB.prepare("UPDATE subscriptions SET status='review_required',updated_at=? WHERE stripe_subscription_id=?")
      .bind(Date.now(),sub).run();
  }
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = origin === 'https://placeoracle.github.io';
    if (origin && !allowed) return json({ error: 'Origin not allowed' }, 403);
    if (request.method === 'OPTIONS') return allowed
      ? new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': origin, Vary: 'Origin',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' } })
      : json({ error: 'Origin not allowed' }, 403);
    const path = new URL(request.url).pathname;
    if(env.DB?.withSession) env={...env,DB:env.DB.withSession('first-primary')};
    try {

      if (path === '/stripe/webhook' && request.method === 'POST') {
  const event = await verifyStripeWebhook(request, env.STRIPE_WEBHOOK_SECRET);
  if (!event?.id || !event?.type) throw new Error('Invalid Stripe event');
  // Record completion only after idempotent fulfillment. A crashed delivery must be retryable.
  const completed = await env.DB.prepare('SELECT 1 FROM stripe_webhook_events WHERE event_id=?')
    .bind(event.id).first();
  if (completed) return json({ received: true, duplicate: true }, 200, origin);
    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded':
        await fulfillSingle(env,event.data.object);
        await saveCheckoutSession(env, event.data.object);
        break;
      case 'checkout.session.async_payment_failed':
      case 'checkout.session.expired':
        await env.DB.prepare("UPDATE po_checkout_orders SET status=? WHERE session_id=? AND status!='paid'").bind(event.type.endsWith('expired')?'expired':'failed',event.data.object.id).run();
        break;
      case 'charge.refunded':
      case 'charge.dispute.created':
      case 'radar.early_fraud_warning.created':
        await revokePayment(env,event);
        break;
      case 'invoice.paid':
      case 'invoice.payment_failed': {
        const invoice=event.data.object;
        const id=stripeId(invoice.subscription||invoice.parent?.subscription_details?.subscription);
        if(id)await saveSubscription(env,await stripeRead(env,'subscriptions/'+encodeURIComponent(id)),event.created||0);
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await saveSubscription(env, event.data.object, event.created || 0);
        break;
    }
  await env.DB.prepare(
    'INSERT OR IGNORE INTO stripe_webhook_events (event_id,event_type,event_created,processed_at) VALUES (?,?,?,?)'
  ).bind(event.id,event.type,event.created||null,Date.now()).run();
  return json({ received: true }, 200, origin);
}
if(path==='/profile'&&['GET','POST'].includes(request.method)){
  if(!allowed)return json({error:'Origin required'},403,origin);
  const user=await sessionUser(request,env);
  if(!user)return json({error:'Authentication required'},401,origin);
  if(request.method==='GET')return json({profile:await getDiagnosisProfile(env,user)},200,origin);
  if(!request.headers.get('Content-Type')?.startsWith('application/json'))return json({error:'JSON required'},415,origin);
  const text=await request.text();if(text.length>3000)return json({error:'Profile too large'},413,origin);
  let body;try{body=JSON.parse(text);}catch{return json({error:'Invalid profile'},400,origin);}
  const result=await saveDiagnosisProfile(env,user,body);return json(result,result.status,origin);
}
if (path === '/portal/create' && request.method === 'POST') {
  if (!allowed) return json({ error: 'Origin required' }, 403, origin);
  const user = await sessionUser(request, env);
  if (!user) return json({ error: 'Authentication required' }, 401, origin);
  const subscription = await env.DB.prepare(
    'SELECT stripe_customer_id FROM subscriptions WHERE LOWER(customer_email)=LOWER(?) AND stripe_price_id IN (?, ?) ORDER BY updated_at DESC LIMIT 1'
  ).bind(user.email, env.STRIPE_PRICE_MONTHLY, env.STRIPE_PRICE_YEARLY).first();
  if (!subscription?.stripe_customer_id) return json({ error: 'No billing account found' }, 404, origin);
  const portal = await createPortalSession(env, subscription.stripe_customer_id);
  return json({ url: portal.url }, 200, origin);
}
if (path === '/checkout/create' && request.method === 'POST') {
  if (!allowed) {
    return json({ error: 'Origin required' }, 403, origin);
  }

  const user = await sessionUser(request, env);

  if (!user) {
    return json({ error: 'Authentication required' }, 401, origin);
  }

  if (!request.headers.get('Content-Type')?.startsWith('application/json')) {
    return json({ error: 'JSON required' }, 415, origin);
  }

  const body = await request.json();

  if (!['single','monthly','yearly'].includes(body.plan)) {
    return json({ error: 'Invalid plan' }, 400, origin);
  }

  if(typeof body.request_id!=='string'||!/^[-A-Za-z0-9_]{16,100}$/.test(body.request_id)) return json({error:'Invalid request ID'},400,origin);
  if(!user.email) return json({error:'Verified email required'},403,origin);
  if(hasTestAccess(env,user)) return json({error:'無料テスト利用が有効です。購入せずに手紙を受け取れます。',code:'test_account'},409,origin);
  const hold=await env.DB.prepare('SELECT 1 FROM subscriptions s JOIN po_billing_holds b ON b.stripe_customer_id=s.stripe_customer_id WHERE LOWER(s.customer_email)=LOWER(?) LIMIT 1').bind(user.email).first();
  if(hold)return json({error:'お支払い状況の確認が必要です。お問い合わせください。'},409,origin);
  if(await paidMembership(env,user)) return json({error:'すでに有効な会員です。契約管理をご確認ください。'},409,origin);
  if(body.plan==='single') {
    const balance=await readingBalance(env,user);
    if(balance.credits>0) return json({error:'購入済みの1回分を先にご利用ください。'},409,origin);
  }
  const orderId=await tokenHash(user.google_sub+':'+body.plan+':'+body.request_id);
  const old=await env.DB.prepare('SELECT * FROM po_checkout_orders WHERE order_id=?').bind(orderId).first();
  if(['expired','failed'].includes(old?.status))return json({error:'前回のお支払い画面の期限が切れました。もう一度選び直してください。',code:'checkout_expired'},409,origin);
  if(old?.session_id && old.status==='created') {
    const previous=await stripeRead(env,'checkout/sessions/'+encodeURIComponent(old.session_id));
    if(previous.status==='open')return json({url:previous.url},200,origin);
    if(previous.status==='expired'){await env.DB.prepare("UPDATE po_checkout_orders SET status='expired' WHERE order_id=?").bind(orderId).run();return json({error:'お支払い画面の期限が切れました。もう一度選んでください。',code:'checkout_expired'},409,origin);}
    return json({error:'お支払いの反映を確認中です。追加のお支払いはせず、少し待ってください。'},409,origin);
  }
  if(old?.status==='paid') return json({error:'このお支払いは完了しています。手紙を受け取ってください。'},409,origin);
  // The Stripe idempotency key also protects retries after a dropped response.
  const session=await createCheckoutSession(env,user,body.plan,orderId);
  await env.DB.prepare(`INSERT OR IGNORE INTO po_checkout_orders
    (order_id,google_sub,plan,session_id,created_at) VALUES (?,?,?,?,?)`)
    .bind(orderId,user.google_sub,body.plan,session.id,Date.now()).run();
  return json({url:session.url},200,origin);
}
if(path==='/readings' && ['GET','POST'].includes(request.method)) {
  if(!allowed) return json({error:'Origin required'},403,origin);
  const user=await sessionUser(request,env);
  if(!user) return json({error:'Authentication required'},401,origin);
  if(request.method==='GET') {
    const cursor=new URL(request.url).searchParams.get('before')||'';
    let stamp=Number.MAX_SAFE_INTEGER,key='~';
    if(cursor){const split=cursor.indexOf('|');stamp=Number(cursor.slice(0,split));key=cursor.slice(split+1);if(split<1||!Number.isSafeInteger(stamp)||key.length>100)return json({error:'Invalid cursor'},400,origin);}
    const result=await env.DB.prepare(`SELECT request_id,day,kind,snapshot,created_at FROM po_reading_history
      WHERE google_sub=? AND (created_at<? OR (created_at=? AND request_id<?))
      ORDER BY created_at DESC,request_id DESC LIMIT 30`).bind(user.google_sub,stamp,stamp,key).all();
    const last=result.results.at(-1);
    return json({readings:result.results.map(r=>({...r,snapshot:JSON.parse(r.snapshot)})),
      next_cursor:result.results.length===30?last.created_at+'|'+last.request_id:null,balance:await readingBalance(env,user)},200,origin);
  }
  if(!request.headers.get('Content-Type')?.startsWith('application/json')) return json({error:'JSON required'},415,origin);
  const text=await request.text();if(text.length>26000) return json({error:'Reading too large'},413,origin);
  let body,snapshot;try{body=JSON.parse(text);snapshot=safeReading(body.snapshot);}catch{return json({error:'Invalid reading'},400,origin);}
  if(typeof body.request_id!=='string'||!/^[-A-Za-z0-9_|]{10,100}$/.test(body.request_id)) return json({error:'Invalid request ID'},400,origin);
  const previous=await env.DB.prepare('SELECT 1 FROM po_reading_history WHERE google_sub=? AND request_id=?').bind(user.google_sub,body.request_id).first();
  if(!previous){
    const registered=await getDiagnosisProfile(env,user);
    if(!registered)return json({error:'生年月日・出生地の登録内容を確認してください。',code:'profile_required'},409,origin);
    if(body.profile_version!==registered.version)return json({error:'プロフィールが更新されています。入力内容を確認し直してください。',code:'profile_stale'},409,origin);
  }
  const grant=await grantReading(env,user,body.request_id,snapshot);
  return json({...grant,balance:await readingBalance(env,user)},grant.ok?200:402,origin);
}
if (path === '/auth/google' && request.method === 'POST') {
        if (!allowed) return json({ error: 'Origin required' }, 403);
        if (!request.headers.get('Content-Type')?.startsWith('application/json')) return json({ error: 'JSON required' }, 415, origin);
        const body = await request.json();
        const user = await verifyGoogleToken(body.credential, env.GOOGLE_CLIENT_ID);
        const token = b64url(crypto.getRandomValues(new Uint8Array(32)));
        const hash = await tokenHash(token);
        await env.DB.prepare(
          'INSERT INTO po_users (google_sub,email,created_at) VALUES (?,?,?) ON CONFLICT(google_sub) DO UPDATE SET email=excluded.email'
        ).bind(user.sub, user.email, Date.now()).run();
        await env.DB.prepare('INSERT INTO po_sessions (token_hash,google_sub,expires_at) VALUES (?,?,?)')
          .bind(hash, user.sub, Date.now() + SESSION_MS).run();
        return json({ token, email: user.email, expires_at: Date.now() + SESSION_MS }, 200, origin);
      }
if (path === '/auth/me' && request.method === 'GET') {
  const user = await sessionUser(request, env);

  if (!user) {
    return json({ authenticated: false }, 401, origin);
  }

  const subscription = await env.DB.prepare(`
    SELECT
      status,
      stripe_price_id,
      current_period_end, stripe_customer_id
    FROM subscriptions
    WHERE LOWER(customer_email) = LOWER(?)
      AND stripe_price_id IN (?, ?)
    ORDER BY updated_at DESC
    LIMIT 1
  `).bind(user.email, env.STRIPE_PRICE_MONTHLY, env.STRIPE_PRICE_YEARLY).first();

  const hold=subscription?await env.DB.prepare('SELECT 1 FROM po_billing_holds WHERE stripe_customer_id=?').bind(subscription.stripe_customer_id).first():null;
  return json({
    authenticated: true,
    email: user.email,
    has_billing_account: !!subscription,
    membership: hasTestAccess(env,user)?'test':hold?'review_required':subscription ? subscription.status : 'none',
    test_access: hasTestAccess(env,user),
    stripe_price_id: subscription?.stripe_price_id ?? null,
    current_period_end: subscription?.current_period_end ?? null,
    reading_balance: await readingBalance(env,user)
  }, 200, origin);
}
      if (path === '/auth/logout' && request.method === 'POST') {
        const user = await sessionUser(request, env);
        if (user) await env.DB.prepare('DELETE FROM po_sessions WHERE token_hash=?').bind(user.hash).run();
        return json({ ok: true }, 200, origin);
      }
      return json({ error: 'Not found' }, 404, origin);
    } catch (error) {
      if (path === '/auth/google' && /token|credential|signing|signature|claims|algorithm|encoding/i.test(error.message))
        return json({ error: 'Google login could not be verified' }, 401, origin);
      console.error('Authentication error', error.name, error.message);
      return json({ error: 'Service unavailable' }, 503, origin);
    }
  }
};
