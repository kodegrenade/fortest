import { Router } from 'express';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { runGroup, getRunById, getGroupRuns } from '../services/runnerService';
import { getBucketById } from '../services/bucketService';
import { broadcastToRun } from '../services/websocketService';
import { ExecutionConfigSchema, type ApiError } from '@fortest/types';

const router: import('express').Router = Router();

// .partial() keeps the limits but skips the defaults, so runGroup can still infer 'load' mode.
const StartRunSchema = z.object({
  bucketId: z.string().uuid(),
  groupId: z.string().uuid(),
  config: ExecutionConfigSchema.partial().optional(),
});

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

  res.json(await getGroupRuns(groupId));
});

/**
 * POST /api/runs
 * Initiates an execution run for an Action Group in the background.
 */
router.post('/', async (req, res) => {
  const { bucketId, groupId, config } = StartRunSchema.parse(req.body);

  // Check up front: once the 201 is sent, a missing bucket/group would fail silently in the background.
  const bucket = await getBucketById(bucketId);
  if (!bucket?.actionGroups.some((g) => g.id === groupId)) {
    const error: ApiError = {
      error: 'Not Found',
      message: 'Bucket or action group not found.',
      statusCode: 404,
    };
    res.status(404).json(error);
    return;
  }

  const runId = randomUUID();

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
