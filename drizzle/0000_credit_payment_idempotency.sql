-- Apply to an existing database after reviewing duplicate provider references.
-- Existing duplicates intentionally cause failure; never delete financial history automatically.
CREATE UNIQUE INDEX IF NOT EXISTS credit_purchases_stripe_payment_uidx
  ON credit_purchases (stripe_payment_intent_id);
CREATE UNIQUE INDEX IF NOT EXISTS credit_purchases_razorpay_order_uidx
  ON credit_purchases (razorpay_order_id);
