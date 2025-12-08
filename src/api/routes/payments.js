const express = require('express');
const router = express.Router();
const { createPayment } = require('../../orchestrator/createPayment');
const { getItem } = require('../../lib/dynamoClient');

router.post('/', async (req, res) => {
  try {
    // validate body minimally; you can use Joi or express-validator later
    const { clientId, amount, idempotencyKey, metadata } = req.body;
    const payload = { clientId, amount, idempotencyKey, metadata };
    const result = await createPayment(payload);
    res.status(202).json(result); // accepted — async processing
  } catch (err) {
    if (err.name === 'BadRequest') return res.status(400).json({ error: err.message });
    console.error('POST /payments error', err);
    res.status(500).json({ error: 'server_error' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const item = await getItem(process.env.TRAN_TABLE, { transactionId: id });
    if (!item) return res.status(404).json({ error: 'not_found' });
    res.json(item);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'server_error' });
  }
});

module.exports = router;
