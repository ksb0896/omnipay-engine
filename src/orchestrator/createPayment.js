// src/orchestrator/index.js
import dotenv from 'dotenv';
dotenv.config();

import { v4 as uuidv4 } from 'uuid';
import { getItem, putItem } from '../lib/dynamoClient.js';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';

// Environment
const AWS_ENDPOINT = process.env.AWS_ENDPOINT || "http://localhost:4566";
const AWS_REGION = process.env.AWS_REGION || "us-east-1";
const TRAN_TABLE = process.env.TRAN_TABLE || "Transactions";
const IDEM_TABLE = process.env.IDEM_TABLE || "Idempotency";
const SQS_QUEUE_URL =
  process.env.SQS_QUEUE_URL ||
  "http://localhost:4566/000000000000/provider-queue";

// SQS client
const sqs = new SQSClient({
  region: AWS_REGION,
  endpoint: AWS_ENDPOINT,
  credentials: { accessKeyId: "test", secretAccessKey: "test" }
});

/**
 * createPayment
 * payload = { clientId, amount, currency?, idempotencyKey?, metadata? }
 */
export async function createPayment(payload) {
  const {
    clientId,
    amount,
    currency = "INR",
    idempotencyKey,
    metadata = {}
  } = payload;

  // Basic validation
  if (!clientId || amount === undefined || amount === null) {
    throw new Error("clientId and amount are required");
  }

  // 1) Idempotency Check
  if (idempotencyKey) {
    const existing = await getItem(IDEM_TABLE, { idempotencyKey });
    if (existing) {
      console.log("Idempotency hit — returning existing transaction", existing.transactionId);
      return { transactionId: existing.transactionId, status: existing.status };
    }
  }

  // 2) Create New Transaction Entry
  const transactionId = uuidv4();
  const now = new Date().toISOString();

  const txn = {
    transactionId,
    clientId,
    amount,
    currency,
    status: "PENDING",
    attempts: 0,
    metadata,
    createdAt: now,
    updatedAt: now
  };

  await putItem(TRAN_TABLE, txn);
  console.log("Stored transaction:", transactionId);

  // 3) Idempotency Mapping Save
  if (idempotencyKey) {
    await putItem(IDEM_TABLE, {
      idempotencyKey,
      transactionId,
      status: "PENDING",
      createdAt: now
    });
    console.log("Stored idempotency:", idempotencyKey, "->", transactionId);
  }

  // 4) Push Job to SQS Worker
  const sqsBody = JSON.stringify({
    transactionId,
    clientId,
    amount,
    currency
  });

  await sqs.send(
    new SendMessageCommand({
      QueueUrl: SQS_QUEUE_URL,
      MessageBody: sqsBody
    })
  );

  console.log("Enqueued SQS job for:", transactionId);

  return { transactionId, status: "PENDING" };
}

// Optional: local test harness (works only when running this file directly)
if (import.meta.url === `file://${process.argv[1]}`) {
  (async () => {
    try {
      console.log("Running createPayment test…");

      const payload = {
        clientId: "aryan-2",
        amount: 120000,
        idempotencyKey: "idem-abc-12111",
        metadata: { orderId: "ORD-1002" }
      };

      const r1 = await createPayment(payload);
      console.log("First:", r1);

      const r2 = await createPayment(payload);
      console.log("Second (idempotent):", r2);
    } catch (err) {
      console.error("Error running test:", err);
    }
  })();
}
