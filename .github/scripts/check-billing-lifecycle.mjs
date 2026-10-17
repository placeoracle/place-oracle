import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';

// Real SQL in an isolated in-memory database; no live Stripe or D1 writes.
const db = new DatabaseSync(':memory:');
db.exec(`
CREATE TABLE po_users (google_sub TEXT PRIMARY KEY,email TEXT,created_at INTEGER);
CREATE TABLE po_sessions (token_hash TEXT PRIMARY KEY,google_sub TEXT,expires_at INTEGER);
CREATE TABLE subscriptions (stripe_subscription_id TEXT PRIMARY KEY,stripe_customer_id TEXT NOT NULL,
 customer_email TEXT,status TEXT NOT NULL,stripe_price_id TEXT,current_period_end INTEGER,
 updated_at INTEGER NOT NULL,stripe_event_created INTEGER);
CREATE TABLE stripe_webhook_events (event_id TEXT PRIMARY KEY,event_type TEXT,event_created INTEGER,processed_at INTEGER);
`);
const DB = { prepare(sql) {
  return { bind(...args) {
    const stmt = db.prepare(sql);
    return {
      async first() { return stmt.get(...args) || null; },
      async run() { return { meta: { changes: stmt.run(...args).changes } }; }
    };
  } };
} };
const now = Math.floor(Date.now() / 1000);
const token = 'a'.repeat(43);
const hash = Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))).toString('base64url');
db.prepare('INSERT INTO po_users VALUES (?,?,?)').run('fixture_subject','qa@example.invalid',Date.now());
db.prepare('INSERT INTO po_sessions VALUES (?,?,?)').run(hash,'fixture_subject',Date.now()+60000);
const env = { DB, STRIPE_PRICE_MONTHLY:'price_month', STRIPE_PRICE_YEARLY:'price_year',
  STRIPE_SECRET_KEY:'fixture_key', STRIPE_WEBHOOK_SECRET:'fixture_webhook' };
const calls = [];
const source = await readFile('billing-worker/worker.mjs','utf8');
const worker = Function('fetch',source.replace('export default','const worker =')+'\nreturn worker;')(
  async (url,options) => {
    calls.push({url,params:new URLSearchParams(options.body)});
    return new Response(JSON.stringify({url:'https://billing.stripe.com/fixture'}));
  }
);
async function request(path,method='GET',body,auth=true,origin='https://placeoracle.github.io') {
  return worker.fetch(new Request('https://worker.invalid'+path,{method,
    headers:{Origin:origin,'Content-Type':'application/json',...(auth?{Authorization:'Bearer '+token}:{})},
    ...(body?{body:JSON.stringify(body)}:{})}),env);
}
async function me() { const r=await request('/auth/me'); assert.equal(r.status,200); return r.json(); }
async function webhook(id,type,object,created=now,valid=true) {
  const body=JSON.stringify({id,type,created,data:{object}});
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.STRIPE_WEBHOOK_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const digest=Buffer.from(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(now+'.'+body))).toString('hex');
  return worker.fetch(new Request('https://worker.invalid/stripe/webhook',{method:'POST',
    headers:{'Stripe-Signature':`t=${now},v1=${valid?digest:'0'.repeat(64)}`},body}),env);
}
const session={mode:'subscription',subscription:'sub_current',customer:'cus_current',customer_email:'qa@example.invalid'};
const sub={id:'sub_current',customer:'cus_current',status:'active',items:{data:[{price:{id:'price_month'},current_period_end:now+3600}]}};
assert.equal((await request('/checkout/create','POST',{plan:'monthly'},false)).status,401);
assert.equal((await request('/portal/create','POST',{},false)).status,401);
assert.equal((await request('/checkout/create','POST',{plan:'monthly'},true,'https://evil.invalid')).status,403);
db.prepare('INSERT INTO subscriptions VALUES (?,?,?,?,?,?,?,?)').run('sub_legacy','cus_legacy','qa@example.invalid','active','price_legacy',now+86400,Date.now()+10000,null);
assert.equal((await me()).membership,'none');
assert.equal((await me()).has_billing_account,false);
assert.equal((await request('/portal/create','POST',{})).status,404);
assert.equal(calls.length,0);
assert.equal((await webhook('evt_invalid','customer.subscription.created',sub,now,false)).status,503);
assert.equal(db.prepare('SELECT count(*) AS n FROM stripe_webhook_events').get().n,0);
assert.equal((await webhook('evt_checkout','checkout.session.completed',session)).status,200);
assert.equal((await me()).membership,'none'); // Checkout redirect/completion alone grants no access.
assert.equal((await webhook('evt_active','customer.subscription.created',sub)).status,200);
assert.equal((await me()).membership,'active');
assert.equal((await me()).has_billing_account,true);
assert.equal((await request('/portal/create','POST',{})).status,200);
assert.equal(calls.at(-1).params.get('customer'),'cus_current');
assert.equal((await (await webhook('evt_active','customer.subscription.created',sub)).json()).duplicate,true);
await webhook('evt_stale','customer.subscription.updated',{...sub,status:'canceled'},now-60);
assert.equal((await me()).membership,'active');
await webhook('evt_period_end','customer.subscription.updated',{...sub,cancel_at_period_end:true},now+1);
assert.equal((await me()).membership,'active');
assert.ok((await me()).current_period_end>now);
await webhook('evt_past_due','customer.subscription.updated',{...sub,status:'past_due'},now+2);
assert.equal((await me()).membership,'past_due');
assert.equal((await me()).has_billing_account,true);
assert.equal((await request('/portal/create','POST',{})).status,200);
await webhook('evt_deleted','customer.subscription.deleted',{...sub,status:'canceled'},now+3);
await webhook('evt_late_checkout','checkout.session.completed',session,now+4);
assert.equal((await me()).membership,'canceled');
assert.equal((await me()).has_billing_account,true);
db.prepare('UPDATE po_sessions SET expires_at=0').run();
assert.equal((await request('/auth/me')).status,401);
assert.equal((await request('/portal/create','POST',{})).status,401);
db.close();
console.log(JSON.stringify({result:'billing-lifecycle-pass',environment:'isolated SQLite + mocked Stripe',
  checks:['authentication','origin','legacy exclusion','signed webhook','invalid signature','duplicate',
    'out-of-order','checkout is not entitlement','period-end cancellation','past-due portal','cancellation','expired session'],
  livePaymentE2E:'unverified'}));
