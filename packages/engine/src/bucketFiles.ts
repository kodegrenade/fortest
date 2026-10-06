import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { BUCKET_FORMAT_VERSION, TestBucketSchema, type TestBucket } from '@fortest/types';

// Bucket files: what the app exports and what the app, API and CLI import.

const ImportedBucketShape = z
  .record(z.string(), z.any())
  .refine((o) => ['name', 'baseUrl', 'variables', 'actionGroups'].some((key) => key in o), {
    message: 'Not a Fortest bucket file: expected name, baseUrl, variables or actionGroups',
  });

/**
 * Turns an imported bucket file into a valid bucket: fresh ids everywhere (so re-importing never
 * collides), timestamps and names/orders filled in, everything else defaulted by the schema.
 * Throws a ZodError (-> 400) on unknown top-level keys or invalid content.
 */
export function prepareImport(input: unknown): TestBucket {
  const { formatVersion = 1, ...raw } = ImportedBucketShape.parse(input);
  if (typeof formatVersion !== 'number' || formatVersion > BUCKET_FORMAT_VERSION) {
    throw new Error(
      `This bucket file uses format version ${formatVersion}; this version of Fortest reads up to ${BUCKET_FORMAT_VERSION}. Upgrade Fortest to import it.`,
    );
  }
  const now = new Date().toISOString();
  const list = (value: unknown): any[] => (Array.isArray(value) ? value : []);
  const fresh = (o: any) => ({
    ...o,
    id: randomUUID(),
    createdAt: o?.createdAt ?? now,
    updatedAt: now,
  });
  const withIds = (value: unknown) => list(value).map((o) => ({ ...o, id: randomUUID() }));

  // Environments get fresh ids too, so the active one is re-pointed. Hand-written files can
  // name it instead (activeEnvironmentId: staging), since they have no ids to refer to.
  const environments = list(raw.environments).map((env) => ({
    ...env,
    id: randomUUID(),
    variables: withIds(env.variables),
  }));
  const active = list(raw.environments).findIndex(
    (env) =>
      raw.activeEnvironmentId != null &&
      (env?.id === raw.activeEnvironmentId || env?.name === raw.activeEnvironmentId),
  );

  return TestBucketSchema.strict().parse({
    name: 'Imported Bucket',
    ...fresh(raw),
    variables: withIds(raw.variables),
    environments,
    activeEnvironmentId: environments[active]?.id ?? null,
    actionGroups: list(raw.actionGroups).map((group, gIdx) => ({
      name: `Action Group ${gIdx + 1}`,
      order: gIdx,
      ...fresh(group),
      dataStore: group.dataStore && { name: 'Data Store', ...fresh(group.dataStore) },
      steps: list(group.steps).map((step, sIdx) => ({
        name: `Step ${sIdx + 1}`,
        order: sIdx,
        ...fresh(step),
        headers: withIds(step.headers),
        params: withIds(step.params),
        extractions: withIds(step.extractions),
        assertions: withIds(step.assertions),
      })),
    })),
  });
}

/** A bucket as exported: the file format version first, and secret variables without their values. */
export function toExportFile(bucket: TestBucket): { formatVersion: number } & TestBucket {
  return { formatVersion: BUCKET_FORMAT_VERSION, ...withoutSecretValues(bucket) };
}

/** Secret variables keep their key and flag but lose their value. */
export function withoutSecretValues(bucket: TestBucket): TestBucket {
  const blank = (vars: TestBucket['variables']) =>
    vars.map((v) => (v.secret ? { ...v, value: '' } : v));
  return {
    ...bucket,
    variables: blank(bucket.variables),
    environments: bucket.environments.map((env) => ({ ...env, variables: blank(env.variables) })),
  };
}
