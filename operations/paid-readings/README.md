# Paid reading rollout

Agreed: two anonymous trials per browser; then a one-time ¥100 reading or membership
at ¥500/month or the existing ¥5,000/year. Both memberships allow five new readings
per JST day. Reading history does not consume a use. Browser storage deletion or
another browser can reset the anonymous trial count; it is not a per-person limit.

The new UI presents pricing only after another reading is requested. Amounts are
secondary text, annual billing is under details, and payment terms remain explicit
on the final confirmation. Existing memberships and their portal remain supported.

## Production status — 2026-10-31

The owner explicitly requested the production switch. PR #30 is merged and the
new UI is published at https://placeoracle.github.io/place-oracle/. Asset URLs
carry `v=20261031-paid1` so returning browsers load the matching billing client.

Production Worker deployment `a7eac83a534e43ea933ecab3db819886` uses the registered
100/500/5000 JPY prices and portal below. The additive schema is applied to billing
D1 `068deef7-8608-4d31-b825-aba2cb60e852`. Webhook
`we_1UWFnXJXOmhsHzI4CMUEAvks` is enabled.

Cloudflare inherited/renamed the staged NEXT secrets into `STRIPE_SECRET_KEY`
and `STRIPE_WEBHOOK_SECRET` without reading their values. Old keys remain as
`STRIPE_SECRET_KEY_PREVIOUS` and `STRIPE_WEBHOOK_SECRET_PREVIOUS`.
The following preparation checklist is retained as a historical deployment record.

Actual isolated-sandbox checks passed: 100 JPY Checkout, signed webhook credit,
single-use credit consumption and exhausted-credit rejection; 500 JPY subscription,
active membership sync, five daily readings and sixth-reading rejection; Portal
access and period-end cancellation. Annual checkout request construction, duplicate/
retried events, refunds and JST boundaries passed automated tests; annual payment
and asynchronous payment methods have not been exercised through real sandbox
Checkout. No production payment was made for QA.

Rollback: stop new purchase entry points first and retain all credits/history.
If no new live purchases have occurred, redeploy the archived previous Worker and
previous price/portal settings, inheriting PREVIOUS secrets into the active names.
After purchases, do not revert fulfillment or delete entitlements blindly.

## Historical preparation checklist

1. The user explicitly selected production account `acct_1UKl62JXOmhsHzI4` (ゆめごこち).
   New prices are recorded in `stripe-target-20261030.json`: single ¥100, monthly
   ¥500, yearly ¥5,000. Preserve existing ¥480/¥4,800 catalog entries. Do not
   reuse the previous account's prices, signing secret or portal configuration.
   Set `STRIPE_PRICE_SINGLE`, `STRIPE_PRICE_MONTHLY`, `STRIPE_PRICE_YEARLY` and
   `STRIPE_PORTAL_CONFIGURATION` together with the account cutover.
2. New endpoint `we_1UWFnXJXOmhsHzI4CMUEAvks` is disabled until cutover.
   `STRIPE_SECRET_KEY_NEXT` was saved by the owner, and the new signing secret
   was stored as `STRIPE_WEBHOOK_SECRET_NEXT` without displaying its value.
   The Worker still uses the old active bindings. Activate the new account only
   after validation and switch the complete set atomically. Preserve old values
   for rollback. Enable the new endpoint after the receiver is ready.
   Required events: checkout.session.completed, checkout.session.async_payment_succeeded,
   checkout.session.async_payment_failed, checkout.session.expired,
   customer.subscription.created/updated/deleted, invoice.paid/payment_failed,
   charge.refunded, charge.dispute.created, radar.early_fraud_warning.created.
   Checkout redirects alone never grant a credit. Paid single sessions must match
   their server order and JPY 100 amount before granting one credit.
3. Validate the real integration in an isolated Stripe sandbox, including delivered
   webhook signatures, async success and duplicate/retried events. Local SQL and
   mocked Checkout tests are not a live payment E2E test.
4. Apply `billing-worker/reading-schema.sql` additively to the existing billing D1
   database `068deef7-8608-4d31-b825-aba2cb60e852`. Do not use the aggregate-counts DB.
5. Deploy the Worker, retaining all bindings and existing secret values. The checked-in
   Worker has been reconciled against the deployed source: the obsolete sales-paused
   code in Git did not reflect the currently deployed Worker.
6. Verify auth and portal continuity, then publish the frontend. Test visits use
   `growth_test=1`. Do not make a real customer payment to test this change.

## Storage and concurrency

`po_checkout_orders` correlates a server order to a first-class Stripe Session ID.
The hashed order ID is also the Checkout idempotency key. Credits are unique per
session; each consumed credit is unique in reading history. A conditional SQLite
INSERT enforces the five-per-day member quota atomically, including parallel requests.
All reads use a D1 first-primary session where available. History is owner-scoped and
paginated. Refund markers prevent a late success event from reviving a revoked credit;
risk events place the affected billing customer on a review hold.

Browser trials and local profile/maps are separate from account history. Only delivered
reading words, place/calendar/sky context and the usage record are sent to account
history. Raw birth/date and birthplace input, personal map notes and the Google token
are not included in reading snapshots. The Stripe/Google authentication information
continues to use the existing endpoints and hashed session tokens.

## Validation

- `node .github/scripts/check-billing-worker.mjs`
- `node .github/scripts/check-billing-lifecycle.mjs`
- `node .github/scripts/check-reading-access.mjs`
- `node .github/scripts/verify-story-gallery.mjs`

Local integration preview uses an in-memory SQLite database and synthetic identity;
its mocked Stripe completion is clearly labelled as no real payment. Its code lives
outside the repository and must never be deployed. Browser checks confirmed two free
readings, the third-reading prompt, one-time purchase/return/history and five member
readings followed by a sixth-reading limit. No production billing changes have been
made as part of those checks.

If a rollback is necessary after real purchases, do not delete credits or history.
Disable new purchase entry points first and preserve fulfillment/history for paid users.
Tax settings are unchanged: displayed prices remain tax-inclusive; Stripe Tax has not
been enabled or represented as configured.
