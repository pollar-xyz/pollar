# Regenerating SDK API types locally

The SDK consumes the backend's v2 OpenAPI document. Generate it from a backend
checkout, then generate the SDK types from that local file. No running Pollar
server, runtime credentials or disabled TLS verification is required.

In `pollar-platform`, on the API revision being documented:

```sh
pnpm install --frozen-lockfile
pnpm openapi:export /tmp/pollar-openapi.v2.json
git rev-parse HEAD
```

In this SDK repository (Node 24 and npm 10.9.4):

```sh
npm ci --ignore-scripts
npm run core:update-openapi -- /tmp/pollar-openapi.v2.json --source-revision BACKEND_FULL_COMMIT_SHA
npm run core:update-openapi -- /tmp/pollar-openapi.v2.json --check
npm run test:ramp-api-types
npx tsc --noEmit -p packages/core/tsconfig.json
```

Replace `BACKEND_FULL_COMMIT_SHA` with the 40-character backend commit. The
updater accepts a local Pollar v2 document, uses `openapi-typescript@7.13.0`,
and records the document SHA-256 and source revision beside `schema.d.ts` in
`schema-source.json`. The first generation may download the pinned generator
from npm; it never downloads the API schema from a running service. Check mode
regenerates into a temporary directory and compares both the types and provenance.
Do not format or hand-edit generated types.

Generate again after DEV-12's final quote/create/status contract lands. Optional
lifecycle fields describe enrolled adapter records; they do not establish that
all providers have migrated, that every advertised direction is available, or
that durable application webhook delivery has shipped.

`tests/ramp-api.types.ts` contains compile-only examples for discovery, exact
quote amounts, transaction reads, saved-action continuation and typed retry.
They do not construct an authenticated client or submit a payment. Public
integration examples remain subject to each route's availability and requirements.
