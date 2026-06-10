import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import type { ApiError } from '@fortest/types';
import proxyRouter from './routes/proxy';
import healthRouter from './routes/health';

const app: express.Application = express();

// --- Middleware ---

app.use(
  cors({
    origin: ['http://localhost:5173'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }),
);

app.use(helmet());

app.use(express.json({ limit: '10mb' }));

app.use(
  rateLimit({
    windowMs: 60 * 1000,
    limit: 100,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: {
      error: 'Too Many Requests',
      message: 'Rate limit exceeded. Try again in a minute.',
      statusCode: 429,
    } satisfies ApiError,
  }),
);

// --- Routes ---

app.use('/api/proxy', proxyRouter);
app.use('/api/health', healthRouter);

// --- Global Error Handler ---
// Express 5 forwards async rejections here automatically

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[Error]', err.message);

  const error: ApiError = {
    error: 'Internal Server Error',
    message: process.env['NODE_ENV'] === 'production' ? 'An unexpected error occurred' : err.message,
    statusCode: 500,
  };
  res.status(500).json(error);
});

export default app;
