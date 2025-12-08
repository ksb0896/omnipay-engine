import dotenv from 'dotenv';
// Note: When importing from 'dotenv', you often need to call config right away if you haven't configured it globally
dotenv.config();

import app from './app.js'; // Note the added file extension is often required in ESM
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`API server listening on http://localhost:${PORT}`);
});