// src/providers/CashfreeMockProvider.js

class CashfreeMockProvider {
    constructor() {
      this.name = "cashfree_mock";
    }
  
    async charge(transaction) {
      // Simulated network delay (Cashfree a bit faster)
      await new Promise(r => setTimeout(r, 120 + Math.random() * 200));
  
      // 75% success rate
      const success = Math.random() < 0.75;
  
      if (success) {
        return {
          success: true,
          providerRef: `CASHFREE-${Math.floor(Math.random() * 100000)}`
        };
      }
  
      return {
        success: false,
        error: "cashfree-mock-failure"
      };
    }
  }
  
  module.exports = CashfreeMockProvider;
  