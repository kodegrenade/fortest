import type { BucketVariable, Environment, TestBucket } from '@fortest/types';

type WithEnvironments = Pick<TestBucket, 'variables' | 'environments' | 'activeEnvironmentId'>;

/** The selected environment (the bucket's active one unless an id is given), if it exists. */
export function activeEnvironment(
  bucket: WithEnvironments,
  id = bucket.activeEnvironmentId,
): Environment | undefined {
  return bucket.environments?.find((e) => e.id === id);
}

/**
 * Variables in effect: the bucket's own, then the environment's (later entries win when
 * interpolating, so the environment overrides). Data-store records and CLI --var go on top of this.
 */
export function effectiveVariables(
  bucket: WithEnvironments,
  environmentId = bucket.activeEnvironmentId,
): BucketVariable[] {
  const env = activeEnvironment(bucket, environmentId);
  return env ? [...bucket.variables, ...env.variables] : bucket.variables;
}
