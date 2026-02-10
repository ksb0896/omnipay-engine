import { simulateWebhook } from "../utils/webhookSimulator.js";

export default class CashfreeMockProvider {
    constructor() {
      this.name = "cashfree_mock";
    }
  
    async charge(transaction) {
      // Forced failure (DLQ / retry testing)
      if (transaction.metadata?.forceFail === true) {
        return {
          initiated: false,
          error: "forced-failure-for-dlq-test"
        };
      }
  
      // Simulate API latency
      await new Promise(r => setTimeout(r, 180 + Math.random() * 300));
  
      const providerRef = `CASHFREE-${Math.floor(Math.random() * 100000)}`;
  
      // Provider decides final outcome internally
      const success = Math.random() < 0.75;
      const webhookPayload = {
        transactionId: transaction.transactionId,
        provider: this.name,
        providerRef,
        finalStatus: success ? "SUCCESS" : "FAILED",
        failureReason: success ? null : "cashfree-provider-decline"
      }
     // simulateWebhook(webhookPayload);
      return {
        initiated: true,
        providerRef,
        webhookPayload
      };
    }
  }
  