// index.js — Simplified orchestrator using dynamoClient.js
require('dotenv').config();
const { v4: uuidv4 } = require('uuid');
const { getItem, putItem, updateItem } = require('../lib/dynamoClient');
const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs');

const AWS_ENDPOINT = process.env.AWS_ENDPOINT || "http://localhost:4566";
const AWS_REGION = process.env.AWS_REGION || "us-east-1";
const TRAN_TABLE = process.env.TRAN_TABLE || "Transactions";
const IDEM_TABLE = process.env.IDEM_TABLE || "Idempotency";
const SQS_QUEUE_URL = process.env.SQS_QUEUE_URL || "http://localhost:4566/000000000000/provider-queue";

const sqs = new SQSClient({
  region: AWS_REGION,
  endpoint: AWS_ENDPOINT,
  credentials: { accessKeyId: "test", secretAccessKey: "test" }
});

/**
 * createPayment
 * payload = { clientId, amount, currency?, idempotencyKey? , metadata? }
 */
async function createPayment(payload) {
  const { clientId, amount, currency = "INR", idempotencyKey, metadata = {} } = payload;
  if (!clientId || (amount === undefined || amount === null)) {
    throw new Error("clientId and amount are required");
  }

  // 1) Idempotency check (fast)
  if (idempotencyKey) {
    const existing = await getItem(IDEM_TABLE, { idempotencyKey });
    if (existing) {
      console.log("Idempotency hit — returning existing transaction:", existing.transactionId);
      return { transactionId: existing.transactionId, status: existing.status };
    }
  }

  // 2) Create transaction
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
  console.log("Stored transaction in DynamoDB:", transactionId);

  // 3) Store idempotency mapping (if provided)
  if (idempotencyKey) {
    await putItem(IDEM_TABLE, { idempotencyKey, transactionId, status: "PENDING", createdAt: now });
    console.log("Stored idempotency mapping:", idempotencyKey, "->", transactionId);
  }

  // 4) Enqueue message to SQS for provider processing
  const messageBody = JSON.stringify({ transactionId, clientId, amount, currency });
  await sqs.send(new SendMessageCommand({ QueueUrl: SQS_QUEUE_URL, MessageBody: messageBody }));
  console.log("Enqueued provider job for transaction:", transactionId);

  return { transactionId, status: "PENDING" };
}

// quick test harness
if (require.main === module) {
  (async () => {
    try {
      console.log("Starting simplified orchestrator test...");
      const payload = {
        clientId: "aryan-2",
        amount: 120000,
        idempotencyKey: "idem-abc-12111",
        metadata: { orderId: "ORD-1002" }
      };

      const r1 = await createPayment(payload);
      console.log("First call result:", r1);

      const r2 = await createPayment(payload);
      console.log("Second call result (idempotent):", r2);

      console.log("Done. Check DynamoDB tables and SQS for items/messages.");
    } catch (err) {
      console.error("Error in orchestrator test:", err);
      process.exitCode = 1;
    }
  })();
}

module.exports = { createPayment };
