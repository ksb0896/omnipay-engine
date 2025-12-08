export default class RazorpayMockProvider {
    constructor() {
      this.name = "razorpay_mock";
    }
  
    async charge(transaction) {
      await new Promise(r => setTimeout(r, 150 + Math.random() * 250));
  
      const success = Math.random() < 0.8; // 80% success
  
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
  