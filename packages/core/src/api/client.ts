import createClient from 'openapi-fetch';
import type { paths } from './schema';

export const pollarApiClient = createClient<paths>({
  baseUrl: 'https://sdk.api.local.pollar.xyz/v1',
});
