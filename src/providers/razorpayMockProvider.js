// src/providers/RazorpayMockProvider.js

class RazorpayMockProvider {
    constructor() {
      this.name = "razorpay_mock";
    }
  
    async charge(transaction) {
      // Simulated network delay
      await new Promise(r => setTimeout(r, 150 + Math.random() * 250));
  
      // 80% success rate
      const success = Math.random() < 0.8;
  
      if (success) {
        return {
          success: true,
          providerRef: `RAZORPAY-${Math.floor(Math.random() * 100000)}`
        };
      }
  
      return {
        success: false,
        error: "razorpay-mock-failure"
      };
    }
  }
  
  module.exports = RazorpayMockProvider;
  