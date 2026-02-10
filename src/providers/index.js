// src/providers/index.js

import MockProvider from "./mockProvider.js";
import RazorpayMockProvider from "./razorpayMockProvider.js";
import CashfreeMockProvider from "./cashfreeMockProvider.js";

// Instantiate providers once (singleton)
const providers = [
  new MockProvider(),
  new RazorpayMockProvider(),
  new CashfreeMockProvider()
];

// Simple round-robin routing
let index = 0;

export function getProvider(transaction) {
  const provider = providers[index];
  index = (index + 1) % providers.length;

  console.log(`[PROVIDER] Selected: ${provider.name}`);
  return provider;
}
