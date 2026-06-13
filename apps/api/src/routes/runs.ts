import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { runGroup, getRunById } from '../services/runnerService';
import { broadcastToRun } from '../services/websocketService';
import type { ApiError } from '@fortest/types';

const router: import('express').Router = Router();

/**
 * POST /api/runs
 * Initiates an execution run for an Action Group in the background.
 */
router.post('/', async (req, res) => {
  const { bucketId, groupId } = req.body;

  if (!bucketId || !groupId) {
    const error: ApiError = {
      error: 'Validation Error',
      message: 'Both bucketId and groupId are required to start a run.',
      statusCode: 400,
    };
    res.status(400).json(error);
    return;
  }

  const runId = uuidv4();

  // Fire execution in background
  runGroup(bucketId, groupId, runId, (event) => {
    broadcastToRun(runId, event);
  }).catch((err) => {
    console.error(`Fatal background run error for run ${runId}:`, err);
  });

  res.status(201).json({ runId });
});

/**
 * GET /api/runs/:id
 * Fetches the status and results of a run.
 */
router.get('/:id', async (req, res) => {
  const runId = req.params['id'];
  if (!runId) {
    res.status(400).json({ error: 'Bad Request', message: 'Missing run id', statusCode: 400 });
    return;
  }

  const run = await getRunById(runId);
  if (!run) {
    const error: ApiError = {
      error: 'Not Found',
      message: `Execution run not found: ${runId}`,
      statusCode: 404,
    };
    res.status(404).json(error);
    return;
  }

  res.json(run);
});

export default router;
