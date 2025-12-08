// src/api/routes/payments.js
import express from 'express';
import { createPayment } from '../../orchestrator/createPayment.js';
import { getItem } from '../../lib/dynamoClient.js';

const router = express.Router();

router.post('/', async (req, res) => {
  try {
    const { clientId, amount, idempotencyKey, metadata } = req.body;

    const payload = { clientId, amount, idempotencyKey, metadata };
    const result = await createPayment(payload);

    // 202 — Accepted (async processing)
    res.status(202).json(result);
  } catch (err) {
    console.error('POST /payments error:', err);

    if (err.name === 'BadRequest') {
      return res.status(400).json({ error: err.message });
    }

    res.status(500).json({ error: 'server_error' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const id = req.params.id;

    const item = await getItem(process.env.TRAN_TABLE, { transactionId: id });

    if (!item) {
      return res.status(404).json({ error: 'not_found' });
    }

    res.json(item);
  } catch (err) {
    console.error('GET /payments/:id error:', err);
    res.status(500).json({ error: 'server_error' });
  }
});

export default router;
