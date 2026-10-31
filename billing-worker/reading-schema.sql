-- Additive: preserves existing subscriptions, users and login sessions.
CREATE TABLE IF NOT EXISTS po_checkout_orders (
 order_id TEXT PRIMARY KEY, google_sub TEXT NOT NULL REFERENCES po_users(google_sub),
 plan TEXT NOT NULL CHECK(plan IN ('single','monthly','yearly')), session_id TEXT UNIQUE,
 payment_intent TEXT, status TEXT NOT NULL DEFAULT 'created', created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS po_orders_user ON po_checkout_orders(google_sub,created_at);
CREATE INDEX IF NOT EXISTS po_orders_payment ON po_checkout_orders(payment_intent);
CREATE TABLE IF NOT EXISTS po_reading_credits (
 session_id TEXT PRIMARY KEY, google_sub TEXT NOT NULL REFERENCES po_users(google_sub),
 payment_intent TEXT, status TEXT NOT NULL DEFAULT 'paid', created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS po_credits_user ON po_reading_credits(google_sub,status);
CREATE TABLE IF NOT EXISTS po_reading_history (
 google_sub TEXT NOT NULL REFERENCES po_users(google_sub), request_id TEXT NOT NULL,
 day TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('member','single')),
 credit_session_id TEXT UNIQUE REFERENCES po_reading_credits(session_id),
 snapshot TEXT NOT NULL, created_at INTEGER NOT NULL,
 PRIMARY KEY(google_sub,request_id)
);
CREATE INDEX IF NOT EXISTS po_readings_day ON po_reading_history(google_sub,day,kind);
CREATE TABLE IF NOT EXISTS po_revoked_payments (payment_intent TEXT PRIMARY KEY,created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS po_billing_holds (stripe_customer_id TEXT PRIMARY KEY,reason TEXT NOT NULL,created_at INTEGER NOT NULL);

CREATE INDEX IF NOT EXISTS po_readings_history ON po_reading_history(google_sub,created_at,request_id);

-- Profile corrections are account-scoped; logout/browser clearing cannot reset them.
CREATE TABLE IF NOT EXISTS po_diagnosis_profiles (
 google_sub TEXT PRIMARY KEY REFERENCES po_users(google_sub),
 birth TEXT NOT NULL, birth_place TEXT NOT NULL,
 corrections_used INTEGER NOT NULL DEFAULT 0 CHECK(corrections_used IN (0,1)),
 version INTEGER NOT NULL DEFAULT 1, updated_at INTEGER NOT NULL
);
