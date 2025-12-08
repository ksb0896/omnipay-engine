// src/providers/index.js

const MockProvider = require("./mockProvider");
const RazorpayMockProvider = require("./razorpayMockProvider");
const CashfreeMockProvider = require("./cashfreeMockProvider");

// Create provider instances
const mockProvider = new MockProvider();
const razorpayProvider = new RazorpayMockProvider();
const cashfreeProvider = new CashfreeMockProvider();

/**
 * getProvider(transaction)
 *
 * Routing logic examples:
 *  - based on merchant ID
 *  - based on transaction amount
 *  - provider failover logic
 *  - round-robin or weighted routing
 */
function getProvider(transaction) {
  const merchant = transaction.clientId;

  // Example merchant-based routing:
  if (merchant === "merchant-razorpay") return razorpayProvider;
  if (merchant === "merchant-cashfree") return cashfreeProvider;

  // Default fallback provider
  return mockProvider;
}

module.exports = { getProvider };
