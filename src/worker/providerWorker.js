// src/worker/providerWorker.js
import dotenv from "dotenv";
dotenv.config();

import { getItem, updateItem } from "../lib/dynamoClient.js";
import { getProvider } from "../providers/index.js";

import {
  SQSClient,
  ReceiveMessageCommand,
  DeleteMessageCommand,
  SendMessageCommand
} from "@aws-sdk/client-sqs";

const AWS_ENDPOINT = process.env.AWS_ENDPOINT || "http://localhost:4566";
const AWS_REGION = process.env.AWS_REGION || "us-east-1";
const SQS_QUEUE_URL = process.env.SQS_QUEUE_URL;
const TRAN_TABLE = process.env.TRAN_TABLE || "Transactions";

const POLL_WAIT_SECONDS = Number(process.env.POLL_WAIT_SECONDS || 5);
const MAX_RETRIES = Number(process.env.MAX_RETRIES || 3);

// SQS Client
const sqs = new SQSClient({
  region: AWS_REGION,
  endpoint: AWS_ENDPOINT,
  credentials: { accessKeyId: "test", secretAccessKey: "test" }
});

/* -----------------------------------------------------
 * processMessage
 * ----------------------------------------------------- */
export async function processMessage(msg) {
  try {
    const body = JSON.parse(msg.Body);
    const { transactionId } = body;

    console.log("[WORKER] Processing txn:", transactionId);

    // Load DB record
    const txn = await getItem(TRAN_TABLE, { transactionId });
    if (!txn) {
      console.warn("[WORKER] Transaction not found, deleting message:", transactionId);
      await deleteMessage(msg);
      return;
    }

    const attempts = (txn.attempts || 0) + 1;

    // Choose provider
    const provider = getProvider(txn);
    console.log(`[WORKER] Using provider: ${provider.name} for txn: ${transactionId}`);

    // Call provider API
    const response = await provider.charge(txn);

    if (response.success) {
      await updateItem(TRAN_TABLE, { transactionId }, {
        status: "SUCCESS",
        attempts,
        providerRef: response.providerRef,
        updatedAt: new Date().toISOString()
      });

      console.log("[WORKER] SUCCESS:", transactionId);
      await deleteMessage(msg);
      return;
    }

    // Failure Handling
    console.warn(`[WORKER] Provider failed (attempt ${attempts}) for txn:`, transactionId);

    await updateItem(TRAN_TABLE, { transactionId }, {
      attempts,
      lastError: response.error,
      updatedAt: new Date().toISOString()
    });

    // Too many retries → mark FAILED
    if (attempts >= MAX_RETRIES) {
      await updateItem(TRAN_TABLE, { transactionId }, {
        status: "FAILED",
        updatedAt: new Date().toISOString()
      });

      console.warn("[WORKER] Marked FAILED:", transactionId);
      await deleteMessage(msg);
      return;
    }

    // Requeue for retry
    await requeueMessage(body);
    await deleteMessage(msg);

  } catch (err) {
    console.error("[WORKER] Error processing message:", err);
  }
}

/* Delete message from SQS */
async function deleteMessage(msg) {
  await sqs.send(new DeleteMessageCommand({
    QueueUrl: SQS_QUEUE_URL,
    ReceiptHandle: msg.ReceiptHandle
  }));
}

/* Requeue same message for retry */
async function requeueMessage(body) {
  await sqs.send(new SendMessageCommand({
    QueueUrl: SQS_QUEUE_URL,
    MessageBody: JSON.stringify(body)
  }));
}

/* -----------------------------------------------------
 * Poll Loop
 * ----------------------------------------------------- */
export async function pollLoop() {
  if (!SQS_QUEUE_URL) {
    console.error("SQS_QUEUE_URL missing in .env");
    process.exit(1);
  }

  console.log("[WORKER] Started. Polling:", SQS_QUEUE_URL);

  while (true) {
    try {
      const resp = await sqs.send(new ReceiveMessageCommand({
        QueueUrl: SQS_QUEUE_URL,
        MaxNumberOfMessages: 5,
        WaitTimeSeconds: POLL_WAIT_SECONDS,
        VisibilityTimeout: 30
      }));

      if (resp.Messages?.length) {
        for (const msg of resp.Messages) {
          await processMessage(msg);
        }
      } else {
        await new Promise(r => setTimeout(r, 500));
      }
    } catch (err) {
      console.error("[WORKER] Poll error:", err);
      await new Promise(r => setTimeout(r, 1500));
    }
  }
}

/* Run directly via: npm run worker */
if (import.meta.url === `file://${process.argv[1]}`) {
  pollLoop().catch(err => {
    console.error("Worker crashed:", err);
    process.exit(1);
  });
}
