// src/providers/index.js

import MockProvider from "./mockProvider.js";
import RazorpayMockProvider from "./razorpayMockProvider.js";
import CashfreeMockProvider from "./cashfreeMockProvider.js";

/* -----------------------------
   Provider Instances
-------------------------------- */
const providers = [
  new RazorpayMockProvider(),
  new CashfreeMockProvider(),
  new MockProvider()
];

/* -----------------------------
   Health State (In-memory)
-------------------------------- */
const providerHealth = {
  razorpay_mock: { failures: 0, unhealthyUntil: null },
  cashfree_mock: { failures: 0, unhealthyUntil: null },
  mock: { failures: 0, unhealthyUntil: null }
};

const FAILURE_THRESHOLD = 3;
const COOLDOWN_MS = 60_000; // 1 minute

/* -----------------------------
   Health Helpers
-------------------------------- */
function isHealthy(providerName) {
  const h = providerHealth[providerName];
  if (!h) return true;
  if (!h.unhealthyUntil) return true;
  return Date.now() > h.unhealthyUntil;
}

function markFailure(providerName) {
  const h = providerHealth[providerName];
  if (!h) return;

  h.failures += 1;

  if (h.failures >= FAILURE_THRESHOLD) {
    h.unhealthyUntil = Date.now() + COOLDOWN_MS;
    console.warn(`[HEALTH] ${providerName} marked UNHEALTHY`);
  }
}

function markSuccess(providerName) {
  const h = providerHealth[providerName];
  if (!h) return;

  h.failures = 0;
  h.unhealthyUntil = null;
}

/* -----------------------------
   Provider Selection
-------------------------------- */
export function getProvider(transaction) {
  for (const provider of providers) {
    if (isHealthy(provider.name)) {
      console.log(`[PROVIDER] Selected: ${provider.name}`);
      return provider;
    }
  }

  console.warn("[PROVIDER] No healthy providers available");
  return null;
}

/* -----------------------------
   Health Hooks (used by worker)
-------------------------------- */
export function reportProviderSuccess(providerName) {
  markSuccess(providerName);
}

export function reportProviderFailure(providerName) {
  markFailure(providerName);
}
