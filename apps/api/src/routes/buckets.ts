import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import * as bucketService from '../services/bucketService';

const router: ExpressRouter = Router();

const CreateBucketSchema = z.object({
  name: z.string().min(1),
  baseUrl: z.string().optional(),
});

router.get('/', async (_req, res, next) => {
  try {
    const buckets = await bucketService.getAllBuckets();
    res.json(buckets);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const bucket = await bucketService.getBucketById(req.params.id!);
    if (!bucket) {
      res.status(404).json({ error: 'Not Found', message: 'Bucket not found', statusCode: 404 });
      return;
    }
    res.json(bucket);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const parsed = CreateBucketSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation Error', message: 'Invalid payload', statusCode: 400 });
      return;
    }
    const bucket = await bucketService.createBucket(parsed.data.name, parsed.data.baseUrl);
    res.status(201).json(bucket);
  } catch (err) {
    next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const bucket = await bucketService.updateBucket(req.params.id!, req.body);
    if (!bucket) {
      res.status(404).json({ error: 'Not Found', message: 'Bucket not found', statusCode: 404 });
      return;
    }
    res.json(bucket);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const success = await bucketService.deleteBucket(req.params.id!);
    if (!success) {
      res.status(404).json({ error: 'Not Found', message: 'Bucket not found', statusCode: 404 });
      return;
    }
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
