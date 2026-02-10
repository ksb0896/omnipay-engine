import MockProvider from "./mockProvider.js";
import RazorpayMockProvider from "./razorpayMockProvider.js";
import CashfreeMockProvider from "./cashfreeMockProvider.js";

// Instantiate providers once (singleton)
const MOCK = new MockProvider();
const RAZORPAY = new RazorpayMockProvider();
const CASHFREE = new CashfreeMockProvider();

// Provider metadata: success rate & optimized for
const PROVIDER_CONFIG = {
  [RAZORPAY.name]: { provider: RAZORPAY, successRate: 0.8, weight: 4, optimizedFor: "INR/standard" },
  [CASHFREE.name]: { provider: CASHFREE, successRate: 0.75, weight: 3, optimizedFor: "high-value" },
  [MOCK.name]: { provider: MOCK, successRate: 0.7, weight: 2, optimizedFor: "fallback" }
};

/**
 * Intelligent provider selection based on:
 * - Transaction currency
 * - Transaction amount
 * - Provider success rates
 */
export function getProvider(transaction) {
  const { currency = "INR", amount = 0 } = transaction;
  const HIGH_VALUE_THRESHOLD = 10000; // Amount above which use high-reliability provider

  // Strategy: Currency-based primary routing
  if (currency === "INR") {
    // INR → Razorpay is most optimized (80% success rate)
    console.log(`[PROVIDER] Currency: ${currency} → Selected: ${RAZORPAY.name} (primary)`);
    return RAZORPAY;
  }

  // Strategy: Amount-based routing for high-value transactions
  if (amount > HIGH_VALUE_THRESHOLD) {
    // High-value → Cashfree for robustness (75% success, handles complex txns)
    console.log(`[PROVIDER] Amount: ${amount} (high) → Selected: ${CASHFREE.name} (robust)`);
    return CASHFREE;
  }

  // Strategy: Default to best overall provider (Razorpay - 80% success)
  console.log(`[PROVIDER] Default fallback → Selected: ${RAZORPAY.name}`);
  return RAZORPAY;
}

/**
 * Weighted random selection for load balancing
 * (Alternative strategy: use when you want to spread load while respecting success rates)
 */
export function getProviderWeighted(transaction) {
  const providers = Object.values(PROVIDER_CONFIG);
  const totalWeight = providers.reduce((sum, p) => sum + p.weight, 0);
  
  let random = Math.random() * totalWeight;
  for (const config of providers) {
    random -= config.weight;
    if (random <= 0) {
      console.log(`[PROVIDER] Weighted selection → ${config.provider.name} (weight: ${config.weight})`);
      return config.provider;
    }
  }
  
  return RAZORPAY; // Fallback
}

/**
 * Health-aware selection: exclude unhealthy providers
 * (Use with circuit breaker pattern in production)
 */
export function getProviderHealthAware(transaction, unhealthyProviders = []) {
  const availableProviders = Object.values(PROVIDER_CONFIG).filter(
    config => !unhealthyProviders.includes(config.provider.name)
  );

  if (availableProviders.length === 0) {
    throw new Error("[PROVIDER] No healthy providers available");
  }

  // Use weighted selection from healthy providers
  const totalWeight = availableProviders.reduce((sum, p) => sum + p.weight, 0);
  let random = Math.random() * totalWeight;
  
  for (const config of availableProviders) {
    random -= config.weight;
    if (random <= 0) {
      console.log(`[PROVIDER] Health-aware selection → ${config.provider.name}`);
      return config.provider;
    }
  }
  
  return availableProviders[0].provider;
}
