// src/worker/providerWorker.js
import dotenv from "dotenv";
dotenv.config();

import { getItem, updateItem } from "../lib/dynamoClient.js";
import { simulateWebhook } from "../utils/webhookSimulator.js";
import {
  getProvider,
  reportProviderSuccess,
  reportProviderFailure
} from "../providers/index.js";

import {
  SQSClient,
  ReceiveMessageCommand,
  DeleteMessageCommand,
  SendMessageCommand
} from "@aws-sdk/client-sqs";

/* ------------------ Config ------------------ */
const AWS_ENDPOINT = process.env.AWS_ENDPOINT || "http://localhost:4566";
const AWS_REGION = process.env.AWS_REGION || "us-east-1";
const SQS_QUEUE_URL = process.env.SQS_QUEUE_URL;
const DLQ_QUEUE_URL = process.env.DLQ_QUEUE_URL;
const TRAN_TABLE = process.env.TRAN_TABLE || "Transactions";

const POLL_WAIT_SECONDS = Number(process.env.POLL_WAIT_SECONDS || 5);
const MAX_RETRIES = Number(process.env.MAX_RETRIES || 1);

/* ------------------ SQS Client ------------------ */
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

    const txn = await getItem(TRAN_TABLE, { transactionId });
    if (!txn) {
      console.warn("[WORKER] Transaction not found, deleting message");
      await deleteMessage(msg);
      return;
    }

    /* Calculate NEXT attempt */
    const attempts = (txn.attempts || 0) + 1;

    const txnWithAttempts = {
      ...txn,
      attempts
    };

    /* Choose provider */
    const provider = getProvider(txnWithAttempts);
    if (!provider) {
      console.error("[WORKER] No healthy providers available");
      await sendToDLQ(body, "NO_HEALTHY_PROVIDER", attempts);
      await deleteMessage(msg);
      return;
    }

    console.log(`[WORKER] Using provider: ${provider.name}`);

    /* Call provider */
    const response = await provider.charge(txnWithAttempts);

    /* ---------------- INITIATION SUCCESS ---------------- */
    if (response.initiated) {
    reportProviderSuccess(provider.name);

    await updateItem(TRAN_TABLE, { transactionId }, {
        status: "PROCESSING",        // webhook will finalize
        attempts,
        provider: provider.name,
        providerRef: response.providerRef,
        updatedAt: new Date().toISOString()
    });

    console.log("[WORKER] Payment initiated, awaiting webhook");

    // OPTIONAL: simulate webhook locally
    simulateWebhook(response.webhookPayload);

    await deleteMessage(msg);
    return;
    }

  

   /* ---------------- INITIATION FAILURE ---------------- */
    console.warn(`[WORKER] Provider initiation failed (attempt ${attempts})`);

    reportProviderFailure(provider.name);

    await updateItem(TRAN_TABLE, { transactionId }, {
    attempts,
    lastError: response.error,
    updatedAt: new Date().toISOString()
    });

    if (attempts >= MAX_RETRIES) {
    await updateItem(TRAN_TABLE, { transactionId }, {
        status: "FAILED",
        attempts,
        updatedAt: new Date().toISOString()
    });

    console.warn("[WORKER] Max retries reached → DLQ");

    await sendToDLQ(body, response.error, attempts);
    await deleteMessage(msg);
    return;
    }

    /* Retry initiation */
    await requeueMessage(body);
    await deleteMessage(msg);

  } catch (err) {
    console.error("[WORKER] Fatal error:", err);
  }
}

/* ------------------ Helpers ------------------ */

async function deleteMessage(msg) {
  await sqs.send(new DeleteMessageCommand({
    QueueUrl: SQS_QUEUE_URL,
    ReceiptHandle: msg.ReceiptHandle
  }));
}

async function requeueMessage(body) {
  await sqs.send(new SendMessageCommand({
    QueueUrl: SQS_QUEUE_URL,
    MessageBody: JSON.stringify(body)
  }));
}

async function sendToDLQ(body, reason, attempts) {
  if (!DLQ_QUEUE_URL) {
    throw new Error("DLQ_QUEUE_URL not configured");
  }

  await sqs.send(new SendMessageCommand({
    QueueUrl: DLQ_QUEUE_URL,
    MessageBody: JSON.stringify({
      ...body,
      attempts,
      failureReason: reason,
      failedAt: new Date().toISOString()
    })
  }));

  console.warn("[DLQ] Sent to DLQ:", body.transactionId);
}

/* ------------------ Poll Loop ------------------ */
export async function pollLoop() {
  console.log("[WORKER] Started polling:", SQS_QUEUE_URL);

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
      }
    } catch (err) {
      console.error("[WORKER] Poll error:", err);
      await new Promise(r => setTimeout(r, 1500));
    }
  }
}

/* Run directly */
if (import.meta.url === `file://${process.argv[1]}`) {
  pollLoop().catch(err => {
    console.error("Worker crashed:", err);
    process.exit(1);
  });
}
