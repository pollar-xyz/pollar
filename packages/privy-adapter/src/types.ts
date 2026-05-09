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
  TX_SUBMIT_FAILED = 'TX_SUBMIT_FAILED',
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
