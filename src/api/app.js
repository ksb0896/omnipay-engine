require('dotenv').config();
const express = require('express');
const morgan = require('morgan');
const helmet = require('helmet');
const cors = require('cors');
const paymentsRouter = require('./routes/payments');

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '50kb' }));
app.use(morgan('combined'));

app.use('/payments', paymentsRouter);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'internal_server_error' });
});

module.exports = app;
