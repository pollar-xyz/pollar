// Server-only plugin. Installed during Pollar backend startup, never in the app bundle.
import { defineRampAdapterRegistration, type RampAdapterProviderScope } from '@pollar/core/ramps';
import { createExampleRampAdapter, type ExampleProviderClient } from './adapter';

/** Pollar's server resolver loads the configured account/credentials and injects its transport. */
export function createExampleRampRegistration(
  resolve: (scope: RampAdapterProviderScope) => Promise<{
    /** The account the credentials belong to; unchanged when they rotate. */
    configurationId: string;
    /** What rotates under it, e.g. a hash of the current credentials. */
    configurationRevision?: string;
    client: ExampleProviderClient;
  }>,
) {
  return defineRampAdapterRegistration('example-bank', {
    defaultChain: 'STELLAR',
    contractVersion: 2,
    async resolveConfiguration(scope) {
      const configured = await resolve(scope);
      return { ...configured, timeoutMs: 15000, clock: () => new Date(), logger: { warn() {} } };
    },
    factory: (dependencies) => createExampleRampAdapter(dependencies.client, dependencies.recorder),
  });
}
