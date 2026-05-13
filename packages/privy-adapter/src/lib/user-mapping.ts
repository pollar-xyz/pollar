import { ConflictError, NotFoundError, type LinkedAccount, type PrivyClient, type User } from '@privy-io/node';
import { withTimeout } from './timeout';

export interface PrivyUserResolution {
  user: User;
  created: boolean;
}

// Privy stores the Pollar-userId → did:privy:... mapping natively in
// linked_accounts[type=custom_auth]. We never persist it on the adapter side:
// every resolution round-trips to Privy. On miss, we create the Privy user
// atomically with a stellar embedded wallet so the next call already has
// everything we need in linked_accounts.
export const getOrCreatePrivyUser = async (
  privy: PrivyClient,
  customUserId: string,
  options: { ensureStellarWallet: boolean; timeoutMs: number },
): Promise<PrivyUserResolution> => {
  try {
    const user = await withTimeout(
      privy.users().getByCustomAuthID({ custom_user_id: customUserId }),
      options.timeoutMs,
    );
    return { user, created: false };
  } catch (err) {
    if (!(err instanceof NotFoundError)) throw err;
  }

  try {
    const user = await withTimeout(
      privy.users().create({
        linked_accounts: [{ type: 'custom_auth', custom_user_id: customUserId }],
        ...(options.ensureStellarWallet ? { wallets: [{ chain_type: 'stellar' as const }] } : {}),
      }),
      options.timeoutMs,
    );
    return { user, created: true };
  } catch (err) {
    // Lost a race against a concurrent create — the user exists now.
    if (err instanceof ConflictError) {
      const user = await withTimeout(
        privy.users().getByCustomAuthID({ custom_user_id: customUserId }),
        options.timeoutMs,
      );
      return { user, created: false };
    }
    throw err;
  }
};

// Stellar wallets created via users.create show up in linked_accounts as a
// LinkedAccountCurveSigningEmbeddedWallet (type='wallet', chain_type='stellar').
// The Privy type permits id: string | null, so we defensively skip null ids.
export const findStellarWalletInUser = (user: User): { id: string; address: string } | null => {
  for (const account of user.linked_accounts as LinkedAccount[]) {
    if (account.type !== 'wallet') continue;
    if (!('chain_type' in account) || account.chain_type !== 'stellar') continue;
    if (!account.id || !account.address) continue;
    return { id: account.id, address: account.address };
  }
  return null;
};
