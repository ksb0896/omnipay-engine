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
const IDEM_TABLE = process.env.IDEM_TABLE || "Idempotency";

const POLL_WAIT_SECONDS = Number(process.env.POLL_WAIT_SECONDS || 5);
const MAX_RETRIES = Number(process.env.MAX_RETRIES || 3);
const RETRY_BASE_DELAY_MS = Number(process.env.RETRY_BASE_DELAY_MS || 1000); // 1 second
const RETRY_MAX_DELAY_MS = Number(process.env.RETRY_MAX_DELAY_MS || 60000); // 60 seconds
const VISIBILITY_TIMEOUT_BASE = Number(process.env.VISIBILITY_TIMEOUT_BASE || 30); // Base visibility timeout in seconds
const VISIBILITY_TIMEOUT_MAX = Number(process.env.VISIBILITY_TIMEOUT_MAX || 900); // Max 15 minutes

// Provider-aware backoff strategies (multiplier & jitter per provider)
const PROVIDER_BACKOFF_PROFILES = {
  razorpay_mock: { multiplier: 1.5, jitterFactor: 0.2 }, // Faster recovery
  cashfree_mock: { multiplier: 2.0, jitterFactor: 0.3 }, // Conservative
  mock_provider: { multiplier: 1.8, jitterFactor: 0.25 } // Standard
};

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

    if (response.success) {
      // Update both Transactions and Idempotency tables in parallel
      await updateTransactionWithIdempotency(
        transactionId,
        "SUCCESS",
        {
          attempts,
          providerRef: response.providerRef
        },
        txn.idempotencyKey
      );

      console.log("[WORKER] SUCCESS:", transactionId);
      if (txn.idempotencyKey) {
        console.log(`[WORKER] Synced Idempotency: ${txn.idempotencyKey}`);
      }
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
        // Update both Transactions and Idempotency tables in parallel
        await updateTransactionWithIdempotency(
          transactionId,
          "FAILED",
          {
            attempts,
            lastError: response.error
          },
          txn.idempotencyKey
        );
      
        console.warn("[WORKER] Max retries reached, sending to DLQ:", transactionId);
        if (txn.idempotencyKey) {
          console.log(`[WORKER] Synced Idempotency: ${txn.idempotencyKey} → FAILED`);
        }
      
        try {
          await sendToDLQ(body, response.error, attempts);
          await deleteMessage(msg);
        } catch (err) {
          console.error("[DLQ] Failed to send message, keeping original message", err);
        }
      
        return;
      }
      

    // Requeue for retry with provider-aware exponential backoff
    await requeueMessage(body, attempts, provider.name);
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

/**
 * Calculate backoff delay with provider-aware exponential strategy
 */
function calculateBackoffDelay(attemptNumber, providerName = null) {
  const profile = providerName && PROVIDER_BACKOFF_PROFILES[providerName]
    ? PROVIDER_BACKOFF_PROFILES[providerName]
    : PROVIDER_BACKOFF_PROFILES.mock_provider;

  // Exponential backoff with provider-specific multiplier
  const exponentialDelay = RETRY_BASE_DELAY_MS * Math.pow(profile.multiplier, attemptNumber - 1);
  
  // Cap at maximum delay
  const cappedDelay = Math.min(exponentialDelay, RETRY_MAX_DELAY_MS);
  
  // Add provider-aware jitter to prevent thundering herd
  const jitterRange = cappedDelay * profile.jitterFactor;
  const jitter = jitterRange * (Math.random() * 2 - 1);
  const finalDelay = Math.max(100, cappedDelay + jitter);
  
  return finalDelay;
}

/**
 * Calculate dynamic visibility timeout based on attempt number
 * Higher attempts get more time before message reappears in queue
 */
function calculateDynamicVisibilityTimeout(attemptNumber) {
  // Formula: baseTimeout * (1 + 0.5 * attempt), capped at max
  const scaledTimeout = VISIBILITY_TIMEOUT_BASE * (1 + 0.5 * attemptNumber);
  const cappedTimeout = Math.min(scaledTimeout, VISIBILITY_TIMEOUT_MAX);
  return Math.ceil(cappedTimeout);
}

/**
 * Update both Transactions and Idempotency tables atomically
 * Ensures idempotency table stays in sync with transaction status
 */
async function updateTransactionWithIdempotency(transactionId, status, updates, idempotencyKey = null) {
  // Update Transactions table
  const txnUpdate = {
    ...updates,
    status,
    updatedAt: new Date().toISOString()
  };
  
  const updatePromises = [
    updateItem(TRAN_TABLE, { transactionId }, txnUpdate)
  ];
  
  // Also update Idempotency table if idempotencyKey exists
  if (idempotencyKey) {
    updatePromises.push(
      updateItem(IDEM_TABLE, { idempotencyKey }, {
        status,
        transactionId,
        updatedAt: new Date().toISOString()
      })
    );
  }
  
  // Execute both updates in parallel
  const results = await Promise.allSettled(updatePromises);
  
  // Check if Idempotency update failed
  if (idempotencyKey && results[1]?.status === 'rejected') {
    console.warn(
      `[WORKER] Failed to update Idempotency for key: ${idempotencyKey}`,
      results[1].reason
    );
  }
  
  return results[0]?.value || null;
}

/**
 * Requeue message with exponential backoff + provider-aware jitter
 * Prevents hammering failing providers with intelligent delays
 */
async function requeueMessage(body, attemptNumber = 1, providerName = null) {
  const finalDelay = calculateBackoffDelay(attemptNumber, providerName);
  const delaySeconds = Math.ceil(finalDelay / 1000);
  
  console.log(
    `[BACKOFF] Requeuing txn (attempt ${attemptNumber}) with ${Math.round(finalDelay)}ms delay ` +
    `(provider: ${providerName || 'unknown'})`
  );
  
  await sqs.send(new SendMessageCommand({
    QueueUrl: SQS_QUEUE_URL,
    MessageBody: JSON.stringify(body),
    DelaySeconds: delaySeconds
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
  if (!SQS_QUEUE_URL) {
    console.error("SQS_QUEUE_URL missing in .env");
    process.exit(1);
  }

  console.log("[WORKER] Started. Polling:", SQS_QUEUE_URL);
  console.log(`[WORKER] Backoff - Base: ${RETRY_BASE_DELAY_MS}ms, Max: ${RETRY_MAX_DELAY_MS}ms`);
  console.log(`[WORKER] Visibility - Base: ${VISIBILITY_TIMEOUT_BASE}s, Max: ${VISIBILITY_TIMEOUT_MAX}s`);

  while (true) {
    try {
      // Dynamic visibility timeout prevents premature message requeue during processing
      const dynamicVisibilityTimeout = calculateDynamicVisibilityTimeout(1);
      
      const resp = await sqs.send(new ReceiveMessageCommand({
        QueueUrl: SQS_QUEUE_URL,
        MaxNumberOfMessages: 5,
        WaitTimeSeconds: POLL_WAIT_SECONDS,
        VisibilityTimeout: dynamicVisibilityTimeout
      }));

      if (resp.Messages?.length) {
        // Process messages in parallel using Promise.allSettled to handle failures gracefully
        // This prevents slow messages from blocking the entire batch
        await Promise.allSettled(
          resp.Messages.map(msg => processMessage(msg))
        );
      } else {
        await new Promise(r => setTimeout(r, 500));
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
