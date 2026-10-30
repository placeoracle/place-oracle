import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const source = await readFile('billing-worker/worker.mjs', 'utf8');
const calls = [];
const mockFetch = async (url, options) => {
  calls.push({ url, params: new URLSearchParams(options.body) });
  return new Response(JSON.stringify({ url: 'https://checkout.stripe.com/example' }), { status: 200 });
};
const { createCheckoutSession, worker } = Function('fetch', source.replace('export default', 'const worker =') + '\nreturn {createCheckoutSession,worker};')(mockFetch);
const env = { STRIPE_PRICE_SINGLE: 'price_single', STRIPE_PRICE_MONTHLY: 'price_month', STRIPE_PRICE_YEARLY: 'price_year', STRIPE_SECRET_KEY: 'fixture_key' };
for (const [plan, price] of [['monthly', 'price_month'], ['yearly', 'price_year']]) {
  await createCheckoutSession(env, { email: 'qa@example.invalid', google_sub: 'fixture_subject' }, plan);
  const { params } = calls.at(-1);
  assert.equal(params.get('line_items[0][price]'), price);
  assert.equal(params.get('managed_payments[enabled]'), 'false');
  assert.equal(params.get('subscription_data[metadata][google_sub]'), 'fixture_subject');
  assert.equal(params.get('success_url'), 'https://placeoracle.github.io/place-oracle/?checkout=success');
}
await assert.rejects(createCheckoutSession(env, { email: 'qa@example.invalid' }, 'invalid'), /Invalid plan/);
assert.equal(calls.length, 2);
const rejected = await worker.fetch(new Request('https://worker.invalid/checkout/create', {method:'POST',headers:{Origin:'https://placeoracle.github.io','Content-Type':'application/json'},body:'{"plan":"monthly"}'}), env);
assert.equal(rejected.status, 401);
assert.equal(calls.length, 2);
await createCheckoutSession(env,{email:'qa@example.invalid',google_sub:'fixture_subject'},'single','fixture_order_id');
assert.equal(calls.at(-1).params.get('mode'),'payment');
assert.equal(calls.at(-1).params.get('line_items[0][price]'),'price_single');
assert.equal([...calls.at(-1).params.keys()].some(k=>k.includes('price_data')),false);
assert.equal(calls.at(-1).params.has('subscription_data[metadata][google_sub]'),false);
console.log(JSON.stringify({result:'billing-worker-pass', plans:3, unauthenticatedCheckout:401}));

