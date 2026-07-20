// Stripe webhook smoke test — verifies the endpoint accepts a correctly
// signed event and rejects a tampered one, without touching real money.
//
// Usage:
//   STRIPE_WEBHOOK_SECRET=whsec_xxx node scripts/test-stripe-webhook.mjs [url]
//
// url defaults to http://localhost:8787/api/billing/webhook
// For the deployed app: node scripts/test-stripe-webhook.mjs https://YOUR-APP.onrender.com/api/billing/webhook
//
// Pass a real stripe_customer_id via TEST_CUSTOMER_ID to also verify the
// plan flip end-to-end (check the users table / admin dashboard after).

import crypto from "node:crypto";

const secret = process.env.STRIPE_WEBHOOK_SECRET;
if (!secret) {
  console.error("Set STRIPE_WEBHOOK_SECRET (from the Stripe dashboard webhook config, starts with whsec_).");
  process.exit(1);
}

const url = process.argv[2] ?? "http://localhost:8787/api/billing/webhook";
const customerId = process.env.TEST_CUSTOMER_ID ?? "cus_test_nonexistent";

// Note: stripe-node verifies against the secret exactly as provided to
// constructEvent. We replicate its scheme: HMAC-SHA256 over `${t}.${payload}`
// keyed by the secret string itself.
function signLikeStripe(payload, signingSecret, timestamp = Math.floor(Date.now() / 1000)) {
  const signed = `${timestamp}.${payload}`;
  const sig = crypto.createHmac("sha256", signingSecret).update(signed).digest("hex");
  return `t=${timestamp},v1=${sig}`;
}

const event = JSON.stringify({
  id: "evt_test_" + Date.now(),
  object: "event",
  type: "checkout.session.completed",
  data: { object: { id: "cs_test_123", object: "checkout.session", customer: customerId } },
});

async function post(body, signature, label, expectOk) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "stripe-signature": signature },
    body,
  });
  const pass = expectOk ? res.status === 200 : res.status === 400;
  console.log(`${pass ? "✓ PASS" : "✗ FAIL"}  ${label} → HTTP ${res.status} (expected ${expectOk ? 200 : 400})`);
  return pass;
}

console.log(`Testing webhook at: ${url}\n`);
let allPass = true;
allPass = (await post(event, signLikeStripe(event, secret), "Valid signature accepted", true)) && allPass;
allPass = (await post(event, signLikeStripe(event, "whsec_wrong_secret"), "Wrong secret rejected", false)) && allPass;
allPass = (await post(event.replace("checkout", "checkout_tampered"), signLikeStripe(event, secret), "Tampered payload rejected", false)) && allPass;
allPass = (await post(event, signLikeStripe(event, secret, Math.floor(Date.now() / 1000) - 60 * 60), "Stale timestamp (1h old) rejected", false)) && allPass;

console.log(allPass ? "\nAll webhook checks passed." : "\nSome checks failed — see above.");
if (customerId !== "cus_test_nonexistent") {
  console.log(`\nSent for customer ${customerId} — verify their plan flipped to 'pro' in the admin dashboard.`);
}
process.exit(allPass ? 0 : 1);
