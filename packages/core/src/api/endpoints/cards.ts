import type { PollarApiClient } from '../client';
import type {
  CardBalance,
  CardDepositAddress,
  CardFunding,
  CardFundingChain,
  CardHolder,
  CardInfo,
  CardKycInput,
  CardOccupation,
  CardProvider,
  CardProviderRegistration,
  CardProviderRegistrationSubmitted,
  CardRequirements,
  CardTransactionsPage,
  CosignRequest,
} from '../../types';
import { PollarApiError } from '../../types';
import { isRecord, stringField } from '../error-fields';

/** Ciphertext as the provider returns it: AES-GCM `iv` and `data` (ciphertext + tag), both base64. */
export interface EncryptedCardSecrets {
  last4: string | null;
  expMonth: string | null;
  expYear: string | null;
  encryptedPan: { iv: string; data: string };
  encryptedCvc: { iv: string; data: string };
}

/** Registering runs the provider's sign-up and KYC in one call; longer than the default client timeout. */
const REGISTRATION_TIMEOUT_MS = 30_000;

function cardsApiError(error: unknown, fallback: string): PollarApiError {
  const body = isRecord(error) ? error : {};
  const code = stringField(body, 'code') ?? stringField(body, 'error') ?? fallback;
  return new PollarApiError(code, body);
}

function content<T>(res: { data?: { content?: T }; error?: unknown }, fallback: string): T {
  if (res.error || res.data?.content === undefined) throw cardsApiError(res.error, fallback);
  return res.data.content;
}

/** `cardProviderId` may be omitted while the app has a single card provider. */
const byProvider = (cardProviderId?: string) => (cardProviderId ? { cardProviderId } : {});

/** GET /cards/providers */
export async function getCardProviders(api: PollarApiClient): Promise<{ providers: CardProvider[] }> {
  return content(await api.GET('/cards/providers'), 'Failed to load card providers');
}

/** GET /cards/holder */
export async function getCardHolder(api: PollarApiClient, cardProviderId?: string): Promise<{ holder: CardHolder | null }> {
  return content(
    await api.GET('/cards/holder', { params: { query: byProvider(cardProviderId) } }),
    'Failed to load card holder',
  );
}

/** POST /cards/holder */
export async function createCardHolder(
  api: PollarApiClient,
  body: { cardProviderId?: string; firstName?: string; lastName?: string; email?: string },
): Promise<{ holder: CardHolder }> {
  return content(await api.POST('/cards/holder', { body }), 'Failed to register card holder');
}

/** POST /cards/holder/kyc */
export async function submitCardKyc(
  api: PollarApiClient,
  body: { cardProviderId?: string; termsAccepted: boolean; kyc: CardKycInput },
): Promise<{ holder: CardHolder }> {
  return content(await api.POST('/cards/holder/kyc', { body }), 'Failed to submit card KYC');
}

/** GET /cards/kyc/occupations */
export async function getCardOccupations(
  api: PollarApiClient,
  cardProviderId?: string,
): Promise<{ occupations: CardOccupation[] }> {
  return content(
    await api.GET('/cards/kyc/occupations', { params: { query: byProvider(cardProviderId) } }),
    'Failed to load occupations',
  );
}

/** GET /cards */
export async function getCards(api: PollarApiClient, cardProviderId?: string): Promise<{ cards: CardInfo[] }> {
  return content(await api.GET('/cards', { params: { query: byProvider(cardProviderId) } }), 'Failed to load cards');
}

/** POST /cards */
export async function issueCard(
  api: PollarApiClient,
  body: { cardProviderId?: string; nickname?: string; limit?: { amount: number; frequency: string } },
): Promise<{ card: CardInfo }> {
  return content(await api.POST('/cards', { body }), 'Failed to issue card');
}

/** GET /cards/balance */
export async function getCardBalance(api: PollarApiClient, cardProviderId?: string): Promise<{ balance: CardBalance | null }> {
  return content(
    await api.GET('/cards/balance', { params: { query: byProvider(cardProviderId) } }),
    'Failed to load card balance',
  );
}

/** GET /cards/transactions */
export async function getCardTransactions(
  api: PollarApiClient,
  params: { cardProviderId?: string; cardId?: string; limit?: number; offset?: number },
): Promise<CardTransactionsPage> {
  return content(await api.GET('/cards/transactions', { params: { query: params } }), 'Failed to load card transactions');
}

/** GET /cards/funding/deposit-addresses */
export async function getCardDepositAddresses(
  api: PollarApiClient,
  cardProviderId?: string,
): Promise<{ depositAddresses: CardDepositAddress[] }> {
  return content(
    await api.GET('/cards/funding/deposit-addresses', { params: { query: byProvider(cardProviderId) } }),
    'Failed to load deposit addresses',
  );
}

/** GET /cards/secrets/public-key */
export async function getCardSecretsPublicKey(
  api: PollarApiClient,
  cardProviderId?: string,
): Promise<{ publicKeyPem: string }> {
  return content(
    await api.GET('/cards/secrets/public-key', { params: { query: byProvider(cardProviderId) } }),
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
    await api.POST('/cards/{cardId}/secrets', { params: { path: { cardId } }, body }),
    'Failed to load card secrets',
  );
}

/**
 * What the user still signs after POST /cards/funding: an external Stellar
 * wallet signs `unsignedXdr`; a co-signed wallet (answered 202) approves `request`;
 * an external Solana wallet signs `unsignedTransaction` and sends it to
 * /tx/submit with `idempotencyKey`.
 */
export type CardFundingPendingSignature =
  | { kind: 'xdr'; unsignedXdr: string }
  | { kind: 'cosign'; request: CosignRequest }
  | { kind: 'solana'; unsignedTransaction: string; idempotencyKey: string; lastValidBlockHeight: number };

/** POST /cards/funding */
export async function createCardFunding(
  api: PollarApiClient,
  body: { cardProviderId?: string; amount: string; chain?: CardFundingChain },
): Promise<{ funding: CardFunding; pendingSignature?: CardFundingPendingSignature }> {
  return content(await api.POST('/cards/funding', { body }), 'Failed to start card funding');
}

/** POST /cards/funding/:id/signature */
export async function submitCardFundingSignature(
  api: PollarApiClient,
  fundingId: string,
  body: { signedXdr: string },
): Promise<{ funding: CardFunding }> {
  return content(
    await api.POST('/cards/funding/{fundingId}/signature', { params: { path: { fundingId } }, body }),
    'Failed to submit the funding payment',
  );
}

/** GET /cards/funding/:id */
export async function getCardFunding(api: PollarApiClient, fundingId: string): Promise<{ funding: CardFunding }> {
  return content(
    await api.GET('/cards/funding/{fundingId}', { params: { path: { fundingId } } }),
    'Failed to load card funding',
  );
}

/** GET /cards/funding */
export async function listCardFundings(api: PollarApiClient, cardProviderId?: string): Promise<{ fundings: CardFunding[] }> {
  return content(
    await api.GET('/cards/funding', { params: { query: byProvider(cardProviderId) } }),
    'Failed to load card fundings',
  );
}

/** GET /cards/requirements */
export async function getCardRequirements(api: PollarApiClient, cardProviderId?: string): Promise<CardRequirements> {
  return content(
    await api.GET('/cards/requirements', { params: { query: byProvider(cardProviderId) } }),
    'Failed to load the card requirements',
  );
}

/** GET /requirements/card-registration/:cardProviderId */
export async function getCardProviderRegistration(
  api: PollarApiClient,
  cardProviderId: string,
): Promise<CardProviderRegistration> {
  const { data, error } = await api.GET('/requirements/card-registration/{cardProviderId}', {
    params: { path: { cardProviderId } },
  });
  if (error || !data?.content) throw cardsApiError(error, 'Failed to load the card registration');
  return data.content;
}

/** POST /requirements/card-registration/:cardProviderId. Sending it is the user's consent. */
export async function submitCardProviderRegistration(
  api: PollarApiClient,
  cardProviderId: string,
): Promise<CardProviderRegistrationSubmitted> {
  const { data, error } = await api.POST('/requirements/card-registration/{cardProviderId}', {
    params: { path: { cardProviderId } },
    headers: { 'x-pollar-timeout-ms': String(REGISTRATION_TIMEOUT_MS) },
  });
  if (error || !data?.content) throw cardsApiError(error, 'Failed to register with the card provider');
  return data.content;
}
