// Derived from stellar-wallet-kit by Tushar Pamnani (MIT)
// https://github.com/tusharpamnani/stellar-wallet-kit

import { WalletType } from './types';
import type {
  WalletAdapter,
  ConnectWalletResponse,
  SignTransactionOptions,
  SignTransactionResponse,
  SignAuthEntryOptions,
  SignAuthEntryResponse,
} from './types';

/** Albedo's own network vocabulary (it only understands these two values). */
type AlbedoNetwork = 'public' | 'testnet';

const PUBLIC_PASSPHRASE = 'Public Global Stellar Network ; September 2015';
const TESTNET_PASSPHRASE = 'Test SDF Network ; September 2015';

/**
 * Resolve the Albedo network for a signing call. Prefers the per-call options
 * the SDK passes (`networkPassphrase`, then `network`) so the signature is
 * produced on the network configured on `PollarClient`; falls back to the
 * network the adapter was constructed with when options carry nothing.
 */
function albedoNetwork(options: SignTransactionOptions | undefined, fallback: AlbedoNetwork): AlbedoNetwork {
  switch (options?.networkPassphrase) {
    case PUBLIC_PASSPHRASE:
      return 'public';
    case TESTNET_PASSPHRASE:
      return 'testnet';
  }
  if (options?.network === 'public' || options?.network === 'mainnet') return 'public';
  if (options?.network === 'testnet') return 'testnet';
  return fallback;
}

function openAlbedoPopup(url: string): Window {
  const popup = window.open(url, 'albedo', 'width=420,height=720,resizable=yes,scrollbars=yes');
  if (!popup) {
    throw new Error('Failed to open Albedo popup (blocked by browser)');
  }
  return popup;
}

function waitForAlbedoPopup(): Promise<Record<string, string>> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Albedo response timeout')), 2 * 60 * 1000);

    function handler(event: MessageEvent) {
      if (event.origin !== window.location.origin || event.data?.type !== 'ALBEDO_RESULT') return;
      clearTimeout(timeout);
      window.removeEventListener('message', handler);
      resolve(event.data.payload as Record<string, string>);
    }

    window.addEventListener('message', handler);
  });
}

function waitForAlbedoResult(): Promise<Record<string, string>> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Albedo response timeout')), 2 * 60 * 1000);

    const parseResult = () => {
      const params = new URLSearchParams(window.location.search);
      if (!params.has('pubkey') && !params.has('signed_envelope_xdr') && !params.has('signed_xdr')) return;

      clearTimeout(timeout);
      const result: Record<string, string> = {};
      params.forEach((value, key) => {
        result[key] = value;
      });
      window.history.replaceState({}, document.title, window.location.pathname);
      resolve(result);
    };

    parseResult();
    window.addEventListener('popstate', parseResult);
  });
}

export class AlbedoAdapter implements WalletAdapter {
  readonly type = WalletType.ALBEDO;

  /**
   * Network used for `connect` and `signAuthEntry` (which carry no per-call
   * network) and as the fallback for `signTransaction`. Defaults to `'testnet'`
   * to preserve the previous behavior when constructed with no argument.
   */
  constructor(private readonly network: AlbedoNetwork = 'testnet') {}

  async isAvailable(): Promise<boolean> {
    return typeof window !== 'undefined';
  }

  async connect(): Promise<ConnectWalletResponse> {
    const url = new URL('https://albedo.link');
    url.searchParams.set('intent', 'public-key');
    url.searchParams.set('app_name', 'Pollar');
    url.searchParams.set('network', this.network);
    url.searchParams.set('callback', `${window.location.origin}/albedo-callback`);
    url.searchParams.set('origin', window.location.origin);

    openAlbedoPopup(url.toString());
    const result = await waitForAlbedoPopup();

    if (!result.pubkey) {
      throw new Error('Albedo connection rejected');
    }

    return { address: result.pubkey };
  }

  async disconnect(): Promise<void> {}

  async getPublicKey(): Promise<string | null> {
    return null; // Albedo does not support silent reconnect
  }

  async getNetwork(): Promise<string> {
    throw new Error('Albedo does not expose network');
  }

  async signTransaction(xdr: string, options?: SignTransactionOptions): Promise<SignTransactionResponse> {
    const url = new URL('https://albedo.link');
    url.searchParams.set('intent', 'tx');
    url.searchParams.set('xdr', xdr);
    url.searchParams.set('app_name', 'Pollar');
    url.searchParams.set('network', albedoNetwork(options, this.network));
    url.searchParams.set('callback', window.location.href);
    url.searchParams.set('origin', window.location.origin);

    window.location.href = url.toString();
    const result = await waitForAlbedoResult();

    if (!result.signed_envelope_xdr) throw new Error('Albedo signing rejected');
    return { signedTxXdr: result.signed_envelope_xdr };
  }

  async signAuthEntry(entryXdr: string, _options?: SignAuthEntryOptions): Promise<SignAuthEntryResponse> {
    const url = new URL('https://albedo.link');
    url.searchParams.set('intent', 'sign-auth-entry');
    url.searchParams.set('xdr', entryXdr);
    url.searchParams.set('app_name', 'Pollar');
    url.searchParams.set('network', this.network);
    url.searchParams.set('callback', window.location.href);
    url.searchParams.set('origin', window.location.origin);

    window.location.href = url.toString();
    const result = await waitForAlbedoResult();

    if (!result.signed_xdr) throw new Error('Albedo auth entry signing rejected');
    return { signedAuthEntry: result.signed_xdr };
  }
}
