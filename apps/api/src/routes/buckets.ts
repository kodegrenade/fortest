import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import * as yaml from 'yaml';
import { v4 as uuidv4 } from 'uuid';
import { TestBucketSchema, type TestBucket, type ActionGroup, type Step, type BucketVariable } from '@fortest/types';
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

router.get('/:id/export', async (req, res, next) => {
  try {
    const bucket = await bucketService.getBucketById(req.params.id!);
    if (!bucket) {
      res.status(404).json({ error: 'Not Found', message: 'Bucket not found', statusCode: 404 });
      return;
    }

    const format = req.query.format === 'yaml' ? 'yaml' : 'json';
    const formatted = format === 'yaml' ? yaml.stringify(bucket) : JSON.stringify(bucket, null, 2);

    const ext = format === 'yaml' ? 'yaml' : 'json';
    const filename = `${bucket.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-export.${ext}`;
    const contentType = format === 'yaml' ? 'application/yaml' : 'application/json';

    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', contentType);
    res.send(formatted);
  } catch (err) {
    next(err);
  }
});

router.post('/import', async (req, res, next) => {
  try {
    const { content, format } = req.body;
    if (!content || !format) {
      res.status(400).json({ error: 'Validation Error', message: 'Missing content or format', statusCode: 400 });
      return;
    }

    let parsed: any;
    try {
      if (format === 'yaml') {
        parsed = yaml.parse(content);
      } else {
        parsed = JSON.parse(content);
      }
    } catch (err: any) {
      res.status(400).json({ error: 'Parsing Error', message: err.message || 'Invalid file format content', statusCode: 400 });
      return;
    }

    const isArray = Array.isArray(parsed);
    const rawBuckets = isArray ? parsed : [parsed];
    const importedBuckets: TestBucket[] = [];

    for (const raw of rawBuckets) {
      const now = new Date().toISOString();
      const variables: BucketVariable[] = (raw.variables || []).map((v: any) => ({
        id: uuidv4(),
        key: v.key || '',
        value: v.value || '',
        enabled: v.enabled !== undefined ? v.enabled : true,
      }));

      const actionGroups: ActionGroup[] = (raw.actionGroups || []).map((g: any, gIdx: number) => {
        const steps: Step[] = (g.steps || []).map((s: any, sIdx: number) => ({
          id: uuidv4(),
          name: s.name || `Step ${sIdx + 1}`,
          order: s.order !== undefined ? s.order : sIdx,
          method: s.method || 'GET',
          path: s.path || '/',
          headers: (s.headers || []).map((h: any) => ({
            id: uuidv4(),
            key: h.key || '',
            value: h.value || '',
            enabled: h.enabled !== undefined ? h.enabled : true,
            description: h.description,
          })),
          params: (s.params || []).map((p: any) => ({
            id: uuidv4(),
            key: p.key || '',
            value: p.value || '',
            enabled: p.enabled !== undefined ? p.enabled : true,
            description: p.description,
          })),
          body: s.body || { type: 'none', content: '' },
          auth: s.auth || { type: 'none' },
          extractions: (s.extractions || []).map((e: any) => ({
            id: uuidv4(),
            variableName: e.variableName || '',
            source: e.source || 'body',
            selector: e.selector || '',
          })),
          assertions: (s.assertions || []).map((a: any) => ({
            id: uuidv4(),
            target: a.target || 'status',
            selector: a.selector || '',
            operator: a.operator || 'equals',
            expected: a.expected || '',
          })),
          createdAt: s.createdAt || now,
          updatedAt: s.updatedAt || now,
        }));

        return {
          id: uuidv4(),
          name: g.name || `Action Group ${gIdx + 1}`,
          description: g.description || '',
          order: g.order !== undefined ? g.order : gIdx,
          steps,
          dataStore: g.dataStore ? {
            id: uuidv4(),
            name: g.dataStore.name || 'Data Store',
            records: g.dataStore.records || [],
            createdAt: g.dataStore.createdAt || now,
          } : undefined,
          createdAt: g.createdAt || now,
          updatedAt: g.updatedAt || now,
        };
      });

      const newBucket: TestBucket = {
        id: uuidv4(),
        name: raw.name || 'Imported Bucket',
        baseUrl: raw.baseUrl || '',
        auth: raw.auth || { type: 'none' },
        variables,
        actionGroups,
        createdAt: raw.createdAt || now,
        updatedAt: now,
      };

      // Zod validation check
      const parsedBucket = TestBucketSchema.safeParse(newBucket);
      if (!parsedBucket.success) {
        res.status(400).json({
          error: 'Validation Error',
          message: 'Imported bucket schema validation failed',
          details: parsedBucket.error.errors,
          statusCode: 400
        });
        return;
      }

      importedBuckets.push(parsedBucket.data);
    }

    // Save all validated buckets
    for (const b of importedBuckets) {
      await bucketService.saveBucket(b);
    }

    res.status(201).json(isArray ? importedBuckets : importedBuckets[0]);
  } catch (err) {
    next(err);
  }
});

export default router;
