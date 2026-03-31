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

export class StellarClient {
  private readonly horizonUrl: string;

  constructor(config: StellarClientConfig) {
    this.horizonUrl = typeof config === 'string' ? HORIZON_URLS[config] : config.horizonUrl;
  }

  async submitTransaction(signedXdr: string): Promise<{ success: true; hash: string } | { success: false; errorCode: string }> {
    try {
      const response = await fetch(`${this.horizonUrl}/transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ tx: signedXdr }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { extras?: { result_codes?: { transaction?: string } } };
        return { success: false, errorCode: body.extras?.result_codes?.transaction ?? 'HORIZON_ERROR' };
      }
      const data = (await response.json()) as { hash: string };
      return { success: true, hash: data.hash };
    } catch {
      return { success: false, errorCode: 'NETWORK_ERROR' };
    }
  }
}
