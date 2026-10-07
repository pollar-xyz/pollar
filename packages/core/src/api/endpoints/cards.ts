import type { PollarApiClient } from '../client';
import type {
  CardBalance,
  CardDepositAddress,
  CardHolder,
  CardInfo,
  CardKycInput,
  CardOccupation,
  CardProvider,
  CardTransactionsPage,
} from '../../types';
import { PollarApiError } from '../../types';

/** Ciphertext as the provider returns it: AES-GCM `iv` and `data` (ciphertext + tag), both base64. */
export interface EncryptedCardSecrets {
  last4: string | null;
  expMonth: string | null;
  expYear: string | null;
  encryptedPan: { iv: string; data: string };
  encryptedCvc: { iv: string; data: string };
}

// `/cards/*` is not in the generated `paths` yet (see the Cards types note in
// types.ts), so the typed client is used through this loose view. It is the same
// instance: DPoP, auth refresh and retries all still apply.
interface LooseApi {
  GET(path: string, init?: { params?: { query?: Record<string, unknown> } }): Promise<{ data?: unknown; error?: unknown }>;
  POST(path: string, init?: { body?: unknown }): Promise<{ data?: unknown; error?: unknown }>;
}

function cardsApiError(error: unknown, fallback: string): PollarApiError {
  const body = (typeof error === 'object' && error !== null ? error : {}) as Record<string, unknown>;
  const code = typeof body.code === 'string' ? body.code : typeof body.error === 'string' ? body.error : fallback;
  return new PollarApiError(code, body);
}

function content<T>(res: { data?: unknown; error?: unknown }, fallback: string): T {
  const data = res.data as { content?: T } | undefined;
  if (res.error || data?.content === undefined) throw cardsApiError(res.error, fallback);
  return data.content;
}

function query(params: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(params)) if (v !== undefined) out[k] = v;
  return out;
}

const loose = (api: PollarApiClient) => api as unknown as LooseApi;

/** GET /cards/providers */
export async function getCardProviders(api: PollarApiClient): Promise<{ providers: CardProvider[] }> {
  return content(await loose(api).GET('/cards/providers'), 'Failed to load card providers');
}

/** GET /cards/holder */
export async function getCardHolder(api: PollarApiClient, cardProviderId?: string): Promise<{ holder: CardHolder | null }> {
  return content(
    await loose(api).GET('/cards/holder', { params: { query: query({ cardProviderId }) } }),
    'Failed to load card holder',
  );
}

/** POST /cards/holder */
export async function createCardHolder(
  api: PollarApiClient,
  body: { cardProviderId?: string; firstName?: string; lastName?: string; email?: string },
): Promise<{ holder: CardHolder }> {
  return content(await loose(api).POST('/cards/holder', { body }), 'Failed to register card holder');
}

/** POST /cards/holder/kyc */
export async function submitCardKyc(
  api: PollarApiClient,
  body: { cardProviderId?: string; termsAccepted: boolean; kyc: CardKycInput },
): Promise<{ holder: CardHolder }> {
  return content(await loose(api).POST('/cards/holder/kyc', { body }), 'Failed to submit card KYC');
}

/** GET /cards/kyc/occupations */
export async function getCardOccupations(
  api: PollarApiClient,
  cardProviderId?: string,
): Promise<{ occupations: CardOccupation[] }> {
  return content(
    await loose(api).GET('/cards/kyc/occupations', { params: { query: query({ cardProviderId }) } }),
    'Failed to load occupations',
  );
}

/** GET /cards */
export async function getCards(api: PollarApiClient, cardProviderId?: string): Promise<{ cards: CardInfo[] }> {
  return content(await loose(api).GET('/cards', { params: { query: query({ cardProviderId }) } }), 'Failed to load cards');
}

/** POST /cards */
export async function issueCard(
  api: PollarApiClient,
  body: { cardProviderId?: string; nickname?: string; limit?: { amount: number; frequency: string } },
): Promise<{ card: CardInfo }> {
  return content(await loose(api).POST('/cards', { body }), 'Failed to issue card');
}

/** GET /cards/balance */
export async function getCardBalance(api: PollarApiClient, cardProviderId?: string): Promise<{ balance: CardBalance | null }> {
  return content(
    await loose(api).GET('/cards/balance', { params: { query: query({ cardProviderId }) } }),
    'Failed to load card balance',
  );
}

/** GET /cards/transactions */
export async function getCardTransactions(
  api: PollarApiClient,
  params: { cardProviderId?: string; cardId?: string; limit?: number; offset?: number },
): Promise<CardTransactionsPage> {
  return content(
    await loose(api).GET('/cards/transactions', { params: { query: query(params) } }),
    'Failed to load card transactions',
  );
}

/** GET /cards/funding/deposit-addresses */
export async function getCardDepositAddresses(
  api: PollarApiClient,
  cardProviderId?: string,
): Promise<{ depositAddresses: CardDepositAddress[] }> {
  return content(
    await loose(api).GET('/cards/funding/deposit-addresses', { params: { query: query({ cardProviderId }) } }),
    'Failed to load deposit addresses',
  );
}

/** GET /cards/secrets/public-key */
export async function getCardSecretsPublicKey(
  api: PollarApiClient,
  cardProviderId?: string,
): Promise<{ publicKeyPem: string }> {
  return content(
    await loose(api).GET('/cards/secrets/public-key', { params: { query: query({ cardProviderId }) } }),
    'Failed to load card secrets key',
  );
}

/** POST /cards/:cardId/secrets */
export async function getCardSecrets(
  api: PollarApiClient,
  cardId: string,
  body: { cardProviderId?: string; sessionId: string },
): Promise<EncryptedCardSecrets> {
  return content(
    await loose(api).POST(`/cards/${encodeURIComponent(cardId)}/secrets`, { body }),
    'Failed to load card secrets',
  );
}
