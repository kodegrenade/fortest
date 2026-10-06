import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import * as yaml from 'yaml';
import { TestBucketSchema, type ApiError } from '@fortest/types';
import * as bucketService from '../services/bucketService';
import { convertPostmanCollection, isPostmanCollection, prepareImport, toExportFile } from '@fortest/engine';

// Express 5 forwards rejected promises to the error handler (ZodError -> 400), so no try/catch here.
const router: ExpressRouter = Router();

const notFound: ApiError = { error: 'Not Found', message: 'Bucket not found', statusCode: 404 };

const CreateBucketSchema = z.object({
  name: z.string().min(1),
  baseUrl: z.string().optional(),
});

const ImportSchema = z.object({
  content: z.string().min(1),
  format: z.enum(['json', 'yaml']),
});

router.get('/', async (_req, res) => {
  res.json(await bucketService.getAllBuckets());
});

router.get('/:id', async (req, res) => {
  const bucket = await bucketService.getBucketById(req.params.id!);
  if (!bucket) return void res.status(404).json(notFound);
  res.json(bucket);
});

router.post('/', async (req, res) => {
  const { name, baseUrl } = CreateBucketSchema.parse(req.body);
  res.status(201).json(await bucketService.createBucket(name, baseUrl));
});

router.put('/:id', async (req, res) => {
  const bucket = await bucketService.updateBucket(req.params.id!, req.body);
  if (!bucket) return void res.status(404).json(notFound);
  res.json(bucket);
});

router.delete('/:id', async (req, res) => {
  if (!(await bucketService.deleteBucket(req.params.id!)))
    return void res.status(404).json(notFound);
  res.status(204).send();
});

router.get('/:id/export', async (req, res) => {
  const bucket = await bucketService.getBucketById(req.params.id!);
  if (!bucket) return void res.status(404).json(notFound);

  const isYaml = req.query.format === 'yaml';
  const filename = `${bucket.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-export.${isYaml ? 'yaml' : 'json'}`;
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Type', isYaml ? 'application/yaml' : 'application/json');
  const exported = toExportFile(bucket);
  res.send(isYaml ? yaml.stringify(exported) : JSON.stringify(exported, null, 2));
});

router.post('/import', async (req, res) => {
  const { content, format } = ImportSchema.parse(req.body);

  let parsed: unknown;
  try {
    parsed = format === 'yaml' ? yaml.parse(content) : JSON.parse(content);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid file format content';
    return void res
      .status(400)
      .json({ error: 'Parsing Error', message, statusCode: 400 } satisfies ApiError);
  }

  // --- Postman Collection ---
  if (!Array.isArray(parsed) && isPostmanCollection(parsed)) {
    const { bucket, warnings } = convertPostmanCollection(parsed);
    const validated = TestBucketSchema.parse(bucket);
    await bucketService.saveBucket(validated);
    return void res
      .status(201)
      .json({ ...validated, _importMeta: { source: 'postman', warnings } });
  }

  // --- Fortest bucket file (one bucket or an array of them) ---
  const isArray = Array.isArray(parsed);
  const buckets = (isArray ? (parsed as unknown[]) : [parsed]).map(prepareImport); // validates all before saving any
  for (const bucket of buckets) await bucketService.saveBucket(bucket);
  res.status(201).json(isArray ? buckets : buckets[0]);
});

export default router;
