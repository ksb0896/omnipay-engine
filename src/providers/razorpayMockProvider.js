export default class RazorpayMockProvider {
    constructor() {
      this.name = "razorpay_mock";
    }
  
    async charge(transaction) {
      if (transaction.metadata?.forceFail === true) {
        return {
          initiated: false,
          error: "forced-failure-for-dlq-test"
        };
      }
  
      await new Promise(r => setTimeout(r, 150 + Math.random() * 250));
  
      const providerRef = `RAZORPAY-${Math.floor(Math.random() * 100000)}`;
      const success = Math.random() < 0.8;
  
      return {
        initiated: true,
        providerRef,
        webhookPayload: {
          transactionId: transaction.transactionId,
          provider: this.name,
          providerRef,
          finalStatus: success ? "SUCCESS" : "FAILED",
          failureReason: success ? null : "razorpay-mock-decline"
        }
      };
    }
  }
  