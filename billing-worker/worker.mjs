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

async function createCheckoutSession(env, user, plan) {
  const priceId =
    plan === 'monthly'
      ? env.STRIPE_PRICE_MONTHLY
      : plan === 'yearly'
        ? env.STRIPE_PRICE_YEARLY
        : null;

  if (!priceId) {
    throw new Error('Invalid plan');
  }

  if (!env.STRIPE_SECRET_KEY) {
    throw new Error('STRIPE_SECRET_KEY missing');
  }

  const params = new URLSearchParams();

  params.set('mode', 'subscription');
  params.set('managed_payments[enabled]', 'false');
  params.set('line_items[0][price]', priceId);
  params.set('line_items[0][quantity]', '1');

  params.set('customer_email', user.email);
  params.set('client_reference_id', user.google_sub);

  params.set(
    'subscription_data[metadata][google_sub]',
    user.google_sub
  );

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
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params.toString()
    }
  );

  const data = await response.json();

  if (!response.ok) {
    console.error('Stripe Checkout error', data);
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
  params.set('configuration', 'bpc_1UMS6S3q8aqnNorIJnqFvsf3');
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
    try {

      if (path === '/stripe/webhook' && request.method === 'POST') {
  const event = await verifyStripeWebhook(request, env.STRIPE_WEBHOOK_SECRET);
  if (!event?.id || !event?.type) throw new Error('Invalid Stripe event');
  const claimed = await env.DB.prepare(
    'INSERT OR IGNORE INTO stripe_webhook_events (event_id,event_type,event_created,processed_at) VALUES (?,?,?,?)'
  ).bind(event.id, event.type, event.created || null, Date.now()).run();
  if (!claimed.meta?.changes) return json({ received: true, duplicate: true }, 200, origin);
  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await saveCheckoutSession(env, event.data.object);
        break;
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await saveSubscription(env, event.data.object, event.created || 0);
        break;
    }
  } catch (error) {
    await env.DB.prepare('DELETE FROM stripe_webhook_events WHERE event_id=?').bind(event.id).run();
    throw error;
  }
  return json({ received: true }, 200, origin);
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

  if (body.plan !== 'monthly' && body.plan !== 'yearly') {
    return json({ error: 'Invalid plan' }, 400, origin);
  }

  const session = await createCheckoutSession(
    env,
    user,
    body.plan
  );

  return json({
    url: session.url
  }, 200, origin);
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
      current_period_end
    FROM subscriptions
    WHERE LOWER(customer_email) = LOWER(?)
      AND stripe_price_id IN (?, ?)
    ORDER BY updated_at DESC
    LIMIT 1
  `).bind(user.email, env.STRIPE_PRICE_MONTHLY, env.STRIPE_PRICE_YEARLY).first();

  return json({
    authenticated: true,
    email: user.email,
    has_billing_account: !!subscription,
    membership: subscription ? subscription.status : 'none',
    stripe_price_id: subscription?.stripe_price_id ?? null,
    current_period_end: subscription?.current_period_end ?? null
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
