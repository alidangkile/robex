import express from 'express';
import cors from 'cors';
import { healthRouter } from './routes/health.route.js';
import { quoteRouter } from './routes/quote.route.js';
import { requestLogger } from './middleware/logger.middleware.js';
import { errorHandler } from './middleware/error.middleware.js';

export function createApp(): express.Application {
  const app = express();

  app.use(cors());
  app.use(express.json());
  app.use(requestLogger);

  app.use(healthRouter);
  app.use(quoteRouter);

  app.use(errorHandler);

  return app;
}
