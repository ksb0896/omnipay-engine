#!/bin/sh
set -euo pipefail

ENDPOINT="http://localstack:4566"
REGION="us-east-1"

TRAN_TABLE="Transactions"
IDEM_TABLE="Idempotency"

QUEUE_NAME="provider-queue"
DLQ_NAME="provider-dlq"

AWSCMD="aws --endpoint-url $ENDPOINT --region $REGION"

echo "Waiting for DynamoDB & SQS to become available..."

# Wait for DynamoDB
until $AWSCMD dynamodb list-tables >/dev/null 2>&1; do
  echo "DynamoDB not ready, retrying..."
  sleep 2
done

# Wait for SQS
until $AWSCMD sqs list-queues >/dev/null 2>&1; do
  echo "SQS not ready, retrying..."
  sleep 2
done

echo "DynamoDB & SQS are ready."

# ------------------------
# DynamoDB Tables
# ------------------------

if ! $AWSCMD dynamodb list-tables | grep -q "$TRAN_TABLE"; then
  echo "Creating table $TRAN_TABLE..."
  $AWSCMD dynamodb create-table \
    --table-name $TRAN_TABLE \
    --attribute-definitions AttributeName=transactionId,AttributeType=S \
    --key-schema AttributeName=transactionId,KeyType=HASH \
    --billing-mode PAY_PER_REQUEST
else
  echo "$TRAN_TABLE already exists."
fi

if ! $AWSCMD dynamodb list-tables | grep -q "$IDEM_TABLE"; then
  echo "Creating table $IDEM_TABLE..."
  $AWSCMD dynamodb create-table \
    --table-name $IDEM_TABLE \
    --attribute-definitions AttributeName=idempotencyKey,AttributeType=S \
    --key-schema AttributeName=idempotencyKey,KeyType=HASH \
    --billing-mode PAY_PER_REQUEST
else
  echo "$IDEM_TABLE already exists."
fi

# ------------------------
# SQS Queues
# ------------------------

# Create DLQ first
if ! $AWSCMD sqs list-queues | grep -q "$DLQ_NAME"; then
  echo "Creating DLQ $DLQ_NAME..."
  $AWSCMD sqs create-queue --queue-name $DLQ_NAME
else
  echo "DLQ $DLQ_NAME already exists."
fi

# Create main queue
if ! $AWSCMD sqs list-queues | grep -q "$QUEUE_NAME"; then
  echo "Creating queue $QUEUE_NAME..."
  $AWSCMD sqs create-queue --queue-name $QUEUE_NAME
else
  echo "Queue $QUEUE_NAME already exists."
fi

echo "Init script finished successfully."
