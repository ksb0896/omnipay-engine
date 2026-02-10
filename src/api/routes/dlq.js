import express from "express";
import {
  SQSClient,
  ReceiveMessageCommand
} from "@aws-sdk/client-sqs";

const router = express.Router();

const AWS_ENDPOINT = process.env.AWS_ENDPOINT || "http://localhost:4566";
const AWS_REGION = process.env.AWS_REGION || "us-east-1";
const DLQ_QUEUE_URL = process.env.DLQ_QUEUE_URL;

const sqs = new SQSClient({
  region: AWS_REGION,
  endpoint: AWS_ENDPOINT,
  credentials: { accessKeyId: "test", secretAccessKey: "test" }
});

/**
 * GET /dlq/messages
 * Read failed messages (non-destructive)
 */
router.get("/messages", async (req, res) => {
  if (!DLQ_QUEUE_URL) {
    return res.status(500).json({ error: "DLQ not configured" });
  }

  try {
    const resp = await sqs.send(
      new ReceiveMessageCommand({
        QueueUrl: DLQ_QUEUE_URL,
        MaxNumberOfMessages: 10,
        WaitTimeSeconds: 1
      })
    );

    const messages =
      resp.Messages?.map(msg => ({
        messageId: msg.MessageId,
        body: JSON.parse(msg.Body)
      })) || [];

    res.json({
      count: messages.length,
      messages
    });
  } catch (err) {
    console.error("DLQ fetch error:", err);
    res.status(500).json({ error: "failed_to_read_dlq" });
  }
});

export default router;
