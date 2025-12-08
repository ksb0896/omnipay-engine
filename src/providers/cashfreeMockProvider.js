export default class CashfreeMockProvider {
    constructor() {
      this.name = "cashfree_mock";
    }
  
    async charge(transaction) {
      await new Promise(r => setTimeout(r, 180 + Math.random() * 300));
  
      const success = Math.random() < 0.75; // 75% success
  
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
  