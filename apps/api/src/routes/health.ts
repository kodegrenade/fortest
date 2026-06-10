import { Router } from 'express';
import type { HealthCheck } from '@fortest/types';
import { getStorageMode } from '../services/storage';

const router: import('express').Router = Router();

router.get('/', (_req, res) => {
  const storageMode = getStorageMode();

  const healthCheck: HealthCheck = {
    status: storageMode === 'redis' ? 'healthy' : 'degraded',
    storageMode,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  };

  res.json(healthCheck);
});

export default router;
