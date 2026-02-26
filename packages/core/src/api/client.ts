import createClient from 'openapi-fetch';
import type { paths } from './schema';

export type PollarApiClient = ReturnType<typeof createApiClient>;

export function createApiClient(baseUrl: string) {
  return createClient<paths>({ baseUrl });
}