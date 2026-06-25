import type { LRUCache } from 'lru-cache';
import type { PrivyClient } from '@privy-io/node';

export type StellarNetwork = 'mainnet' | 'testnet';

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export enum SuccessCode {
  PRIVY_ADAPTER_HEALTH_OK = 'PRIVY_ADAPTER_HEALTH_OK',
  PRIVY_ADAPTER_WALLET_CREATED = 'PRIVY_ADAPTER_WALLET_CREATED',
  PRIVY_ADAPTER_WALLET_EXISTS = 'PRIVY_ADAPTER_WALLET_EXISTS',
  PRIVY_ADAPTER_WALLET_ADDRESS = 'PRIVY_ADAPTER_WALLET_ADDRESS',
  PRIVY_ADAPTER_TX_SIGNED = 'PRIVY_ADAPTER_TX_SIGNED',
}

export enum ErrorCode {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  FORBIDDEN = 'FORBIDDEN',
  WALLET_NOT_FOUND = 'WALLET_NOT_FOUND',
  WALLET_CREATION_FAILED = 'WALLET_CREATION_FAILED',
  TX_INVALID_SIGNED_XDR = 'TX_INVALID_SIGNED_XDR',
  TX_OPERATION_NOT_ALLOWED = 'TX_OPERATION_NOT_ALLOWED',
  TX_SIGN_FAILED = 'TX_SIGN_FAILED',
  WALLET_LOOKUP_FAILED = 'WALLET_LOOKUP_FAILED',
  INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',
}

export interface PollarPrivyAdapterConfig {
  getCredentials: () => Promise<{ appId: string; appSecret: string }>;
  pollarApiSecret: string;
  network: StellarNetwork;
  port?: number;
  cacheTtlMs?: number;
  requestTimeoutMs?: number;
  maxBodyBytes?: number;
  // Operation allowlist. Restricts which Stellar operations the adapter is
  // willing to sign. Because signing goes through Privy `rawSign` (only the tx
  // HASH reaches Privy), the adapter is the only place per-operation policy can
  // be enforced. See `validateTxOperations` in `stellar.ts` for the precedence
  // rules between the two fields below.
  //
  // `allowedOperations`: explicit list of stellar-sdk operation type names
  // (e.g. ['changeTrust', 'payment']). `undefined` → no restriction (legacy).
  allowedOperations?: string[];
  // `restrictToTrustlines`: shortcut that allows the trustline preset
  // (changeTrust + the sponsorship sandwich) AND additionally requires at least
  // one `changeTrust`. When set together with `allowedOperations`, the effective
  // allowlist is the union of both.
  restrictToTrustlines?: boolean;
  onWalletCreated?: (userId: string, address: string) => void;
  onTransactionSigned?: (walletAddress: string) => void;
  onError?: (error: Error, ctx: { endpoint: string; body: unknown }) => void;
}

export interface PollarPrivyAdapter {
  start(): Promise<void>;
  stop(): Promise<void>;
}

export type ResolvedAdapterConfig = PollarPrivyAdapterConfig & {
  port: number;
  cacheTtlMs: number;
  requestTimeoutMs: number;
  maxBodyBytes: number;
};

export type WalletCache = LRUCache<string, string>;

export interface AdapterDeps {
  config: ResolvedAdapterConfig;
  getPrivy: () => Promise<PrivyClient>;
  walletCache: WalletCache;
}

export type AppEnv = {
  Variables: {
    content: <T>(code: SuccessCode, content: T, status?: number) => Response;
    contents: <T>(contents: T[], meta: PaginationMeta) => Response;
    error: (code: ErrorCode, status?: number, extra?: Record<string, unknown>) => Response;
  };
};
