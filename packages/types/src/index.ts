// Core request/response
export {
  HttpMethodSchema,
  KeyValuePairSchema,
  BodyTypeSchema,
  RequestBodySchema,
  AuthTypeSchema,
  AuthConfigSchema,
  ForTestRequestSchema,
  ForTestResponseSchema,
} from './request';
export type {
  HttpMethod,
  KeyValuePair,
  BodyType,
  RequestBody,
  AuthType,
  AuthConfig,
  ForTestRequest,
  ForTestResponse,
} from './request';

// Collections
export { FolderSchema, CollectionSchema } from './collection';
export type { Folder, Collection } from './collection';

// Environments
export {
  VariableTypeSchema,
  EnvironmentVariableSchema,
  EnvironmentSchema,
} from './environment';
export type { VariableType, EnvironmentVariable, Environment } from './environment';

// History
export { HistoryEntrySchema } from './history';
export type { HistoryEntry } from './history';

// API contracts
export {
  ProxyRequestSchema,
  ProxyResponseSchema,
  StorageModeSchema,
  ApiErrorSchema,
  HealthCheckSchema,
} from './api';
export type {
  ProxyRequest,
  ProxyResponse,
  StorageMode,
  ApiError,
  HealthCheck,
} from './api';
