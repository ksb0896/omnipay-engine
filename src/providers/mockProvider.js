import { simulateWebhook } from "../utils/webhookSimulator.js";

export default class MockProvider {
  constructor() {
    this.name = "mock";
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
    await new Promise(r => setTimeout(r, 200 + Math.random() * 300));

    const providerRef = `MOCK-${Math.floor(Math.random() * 100000)}`;

    // Provider decides final outcome internally
    const success = Math.random() < 0.7;
    const webhookPayload = {
      transactionId: transaction.transactionId,
      provider: this.name,
      providerRef,
      finalStatus: success ? "SUCCESS" : "FAILED",
      failureReason: success ? null : "mock-provider-decline"
    }
    //simulateWebhook(webhookPayload);
    return {
      initiated: true,
      providerRef,
      webhookPayload
    };
  }
}
