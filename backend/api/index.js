import { validateConfig } from '../config/environment.js';
import databaseConnection from '../config/database.js';
import { createApp } from '../app.js';

validateConfig();

const app = createApp();

// Connect to MongoDB once on cold start, reuse on warm invocations
let isConnected = false;
app.use(async (req, res, next) => {
  if (!isConnected) {
    await databaseConnection.connect();
    isConnected = true;
  }
  next();
});

export default app;
