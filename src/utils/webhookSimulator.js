import fetch from "node-fetch";

const WEBHOOK_URL = "http://localhost:3000/webhook/provider";

export async function simulateWebhook(payload) {
  setTimeout(async () => {
    try {
      await fetch(WEBHOOK_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-SIGNATURE": "mock-signature"
        },
        body: JSON.stringify(payload)
      });

      console.log("[WEBHOOK-SIM] Webhook sent for", payload.transactionId);
    } catch (err) {
      console.error("[WEBHOOK-SIM] Failed to send webhook", err);
    }
  }, 1500); // async delay like real providers
}
