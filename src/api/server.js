// src/api/server.js
require('dotenv').config();
const app = require('./app'); // src/api/app.js
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`API server listening on http://localhost:${PORT}`);
});
