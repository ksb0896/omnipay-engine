import express from "express";
import { updateItem, getItem } from "../../lib/dynamoClient.js";

const router = express.Router();
const TRAN_TABLE = process.env.TRAN_TABLE;

/**
 * Provider Webhook
 * POST /webhook/provider
 */
router.post("/provider", async (req, res) => {
    try {
      const {
        transactionId,
        provider,
        finalStatus,
        providerRef
      } = req.body;
  
      if (!transactionId || !finalStatus) {
        return res.status(400).json({ error: "invalid_payload" });
      }
  
      const txn = await getItem(TRAN_TABLE, { transactionId });
      if (!txn) {
        return res.status(404).json({ error: "transaction_not_found" });
      }
  
      // Idempotency guard
      if (txn.status === "SUCCESS" || txn.status === "FAILED") {
        return res.json({ ok: true, ignored: true });
      }
  
      await updateItem(TRAN_TABLE, { transactionId }, {
        status: finalStatus,
        provider,
        providerRef,
        updatedAt: new Date().toISOString()
      });
  
      console.log("[WEBHOOK] Finalized txn:", transactionId, finalStatus);
      return res.json({ ok: true });
  
    } catch (err) {
      console.error("[WEBHOOK] Error", err);
      return res.status(500).json({ error: "webhook_error" });
    }
  });
  
export default router;
