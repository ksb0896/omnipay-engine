# Serverless Payments – Multi-Provider Orchestrator (Starter)

A hands-on backend project to practice **event-driven**, **cloud-native** payment architecture — similar to how modern fintech systems (Razorpay, Cashfree, Stripe, PayU) orchestrate payments behind the scenes.

This repo implements a **Serverless Multi-Payment Orchestrator** with:

- Asynchronous payment processing via **SQS + Worker**
- **Idempotent** payment creation
- **Pluggable provider adapters** (Mock, RazorpayMock, CashfreeMock)
- **Retries & failure handling**
- **DynamoDB** as the source of truth for transactions

---

## 🚀 Core Ideas

This project is designed to practice real-world backend patterns:

- **Event-driven workflows** using queues
- **Idempotency** for safe retries
- **Asynchronous processing** for scalability and resilience
- **Provider abstraction** so you can swap / add providers without changing core logic

You can evolve this into a full-blown orchestration layer for real payment gateways.

---

## ⚙️ Features

- **Payment Orchestrator API (Node.js + Express)**
  - `POST /payments` to create a payment (returns immediately with `PENDING`)
  - `GET /payments/:id` to fetch live status (`PENDING / SUCCESS / FAILED`)

- **Idempotency Layer**
  - Uses an `Idempotency` table to ensure the same `idempotencyKey` always maps to the same `transactionId`
  - Prevents duplicate charges when clients retry requests

- **Asynchronous Processing (SQS + Worker)**
  - API enqueues a payment job into SQS
  - A background **Provider Worker** consumes jobs and calls the appropriate provider

- **Pluggable Provider Adapters**
  - `MockProvider` – base mock provider
  - `RazorpayMockProvider` – simulates Razorpay-like behavior
  - `CashfreeMockProvider` – simulates Cashfree-like behavior
  - Easily extendable to real Razorpay / Cashfree / Stripe adapters

- **Provider Routing Logic**
  - Simple rules (e.g. by currency/amount) in `src/providers/index.js`:
    - INR → RazorpayMock
    - High value → CashfreeMock
    - Fallback → MockProvider

- **Retries & Failure Handling**
  - Worker tracks `attempts` in DynamoDB
  - Retries failed transactions up to `MAX_RETRIES`
  - Marks transaction as `FAILED` after max attempts

- **End-to-End Audit Trail**
  - DynamoDB `Transactions` table stores full state:
    - `PENDING → SUCCESS / FAILED`
    - `attempts`, `lastError`, `providerRef`, timestamps

---

## 🧱 Architecture Overview

**High-level flow:**

1. Client calls `POST /payments`
2. API:
   - validates input
   - performs idempotency check
   - creates/updates transaction in DynamoDB
   - enqueues a job into SQS
3. Worker:
   - polls SQS
   - loads transaction from DynamoDB
   - selects provider (Mock / RazorpayMock / CashfreeMock)
   - calls `provider.charge(txn)`
   - updates status in DynamoDB (`SUCCESS` / `FAILED` + retries)
4. Client (or another service) calls `GET /payments/:id` to fetch status

```mermaid
flowchart LR
  A[Client / Merchant App] -->|POST /payments| B[Payment API (Express)]
  B --> C[Idempotency + Create Transaction]
  C --> D[(DynamoDB\nTransactions + Idempotency)]
  B -->|Send Job| E[[SQS Queue]]

  E --> F[Provider Worker]
  F --> G[Provider Router\n(Mock / RazorpayMock / CashfreeMock)]
  G --> H[provider.charge(txn)]
  H --> D

  A -->|GET /payments/:id| I[Status API]
  I --> D
  D --> I
  I --> A
