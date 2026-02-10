// src/api/app.js
import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import morgan from 'morgan';
import helmet from 'helmet';
import cors from 'cors';

import paymentsRouter from './routes/payments.js';
import dlqRouter from './routes/dlq.js';
import webHookRouter from './routes/webhook.js';

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '50kb' }));
app.use(morgan('combined'));

// Routes
app.use('/payments', paymentsRouter);
app.use('/dlq', dlqRouter);
app.use('/webhook', webHookRouter);

// Error handler
app.use((err, req, res, next) => {
  console.error('[API ERROR]', err);
  res.status(500).json({ error: 'internal_server_error' });
});

export default app;
