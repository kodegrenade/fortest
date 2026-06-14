import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { runGroup, getRunById, getGroupRuns } from '../services/runnerService';
import { broadcastToRun } from '../services/websocketService';
import type { ApiError } from '@fortest/types';

const router: import('express').Router = Router();

/**
 * GET /api/runs
 * Lists the historical execution runs for an Action Group.
 */
router.get('/', async (req, res) => {
  const groupId = req.query['groupId'];

  if (typeof groupId !== 'string') {
    const error: ApiError = {
      error: 'Bad Request',
      message: 'groupId query parameter is required.',
      statusCode: 400,
    };
    res.status(400).json(error);
    return;
  }

  try {
    const runsList = await getGroupRuns(groupId);
    res.json(runsList);
  } catch (err: any) {
    const error: ApiError = {
      error: 'Internal Server Error',
      message: err.message || 'Failed to list execution runs.',
      statusCode: 500,
    };
    res.status(500).json(error);
  }
});

/**
 * POST /api/runs
 * Initiates an execution run for an Action Group in the background.
 */
router.post('/', async (req, res) => {
  const { bucketId, groupId, config } = req.body;

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
  runGroup(bucketId, groupId, runId, config, (event) => {
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
