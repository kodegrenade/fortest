import path from 'path';
import express, { type Request, type Response, type NextFunction } from 'express';
import helmet from 'helmet';
import { ZodError } from 'zod';
import type { ApiError } from '@fortest/types';
import { localOnly } from './middleware/security';
import healthRouter from './routes/health';
import bucketsRouter from './routes/buckets';
import runsRouter from './routes/runs';

const app: express.Application = express();

// --- Middleware ---

app.use(localOnly);

app.use(helmet());

app.use(express.json({ limit: '10mb' }));

// --- Routes ---

app.use('/api/health', healthRouter);
app.use('/api/buckets', bucketsRouter);
app.use('/api/runs', runsRouter);

// --- Serve static frontend in production ---
if (process.env['NODE_ENV'] === 'production') {
  const webDistPath = path.resolve(__dirname, '../../web/dist');
  app.use(express.static(webDistPath));

  app.get('*splat', (req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/ws')) {
      return next();
    }
    res.sendFile(path.join(webDistPath, 'index.html'));
  });
}

// --- Global Error Handler ---
// Express 5 forwards async rejections here automatically

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof ZodError) {
    const error: ApiError = {
      error: 'Validation Error',
      message: err.errors.map((e) => `${e.path.join('.') || 'body'}: ${e.message}`).join('; '),
      statusCode: 400,
    };
    res.status(400).json(error);
    return;
  }

  console.error('[Error]', err.message);

  const error: ApiError = {
    error: 'Internal Server Error',
    message: process.env['NODE_ENV'] === 'production' ? 'An unexpected error occurred' : err.message,
    statusCode: 500,
  };
  res.status(500).json(error);
});

export default app;
