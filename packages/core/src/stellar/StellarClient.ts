export type StellarNetwork = 'mainnet' | 'testnet';

const HORIZON_URLS: Record<StellarNetwork, string> = {
  mainnet: 'https://horizon.stellar.org',
  testnet: 'https://horizon-testnet.stellar.org',
};

export type StellarClientConfig = StellarNetwork | { horizonUrl: string };

export interface StellarBalance {
  asset: string;
  balance: string;
  assetIssuer?: string;
}

export type GetBalancesResult =
  | { success: true; balances: StellarBalance[] }
  | { success: false; errorCode: 'ACCOUNT_NOT_FOUND' | 'HORIZON_ERROR' | 'NETWORK_ERROR'; balances: [] };

interface HorizonBalance {
  balance: string;
  asset_type: 'native' | 'credit_alphanum4' | 'credit_alphanum12' | 'liquidity_pool_shares';
  asset_code?: string;
  asset_issuer?: string;
}

interface HorizonAccountResponse {
  balances: HorizonBalance[];
}

export class StellarClient {
  private readonly horizonUrl: string;

  constructor(config: StellarClientConfig) {
    this.horizonUrl = typeof config === 'string' ? HORIZON_URLS[config] : config.horizonUrl;
  }

  async getBalances(publicKey: string): Promise<GetBalancesResult> {
    try {
      const response = await fetch(`${this.horizonUrl}/accounts/${publicKey}`);

      if (!response.ok) {
        if (response.status === 404) {
          console.warn(`[StellarClient] Account not found: ${publicKey}`);
          return { success: false, errorCode: 'ACCOUNT_NOT_FOUND', balances: [] };
        }
        console.warn(`[StellarClient] Horizon API error: ${response.status}`);
        return { success: false, errorCode: 'HORIZON_ERROR', balances: [] };
      }

      const data = (await response.json()) as HorizonAccountResponse;

      return {
        success: true,
        balances: data.balances
          .filter((b) => b.asset_type !== 'liquidity_pool_shares')
          .map((b) => ({
            asset: b.asset_type === 'native' ? 'XLM' : (b.asset_code ?? ''),
            balance: b.balance,
            ...(b.asset_type !== 'native' && { assetIssuer: b.asset_issuer }),
          })),
      };
    } catch (error) {
      console.warn('[StellarClient] Network error fetching balances', error);
      return { success: false, errorCode: 'NETWORK_ERROR', balances: [] };
    }
  }
}
