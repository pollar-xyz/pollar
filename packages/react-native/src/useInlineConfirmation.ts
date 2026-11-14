import type { PendingConfirmation } from '@pollar/core';
import { createContext, useCallback, useContext, useEffect, useRef } from 'react';
import { usePollar } from './context';

/**
 * The confirmation a modal answers in its own view while `active`: the
 * provider opens no prompt over it meanwhile, so the user confirms where they
 * already see the transaction. Null while inactive or nothing waits.
 */
export function useInlineConfirmation(active: boolean): PendingConfirmation | null {
  const { confirmations, registerConfirmationHost } = usePollar();
  useEffect(() => (active ? registerConfirmationHost() : undefined), [active, registerConfirmationHost]);
  return active ? (confirmations[0] ?? null) : null;
}

type Track = <T>(call: Promise<T>) => Promise<T>;

/** How a panel marks its own signing call; outside a modal that declines on close, it only passes the call through. */
export const OwnCallsContext = createContext<Track>((call) => call);

export function useTrackOwnCall(): Track {
  return useContext(OwnCallsContext);
}

/**
 * Closing a modal while one of its own signing calls waits for the user's yes
 * declines that confirmation: the user left without signing. Left pending, it
 * would reopen as the provider's prompt once the modal is gone. Only a call
 * passed to `track` counts, so a confirmation another flow queued is never
 * declined from here.
 */
export function useDeclineOnClose(): { track: Track; declineOnClose: () => void } {
  const { confirmations } = usePollar();
  const pending = useRef(0);
  const track = useCallback<Track>(async (call) => {
    pending.current += 1;
    try {
      return await call;
    } finally {
      pending.current -= 1;
    }
  }, []);
  const first = confirmations[0] ?? null;
  const declineOnClose = useCallback(() => {
    if (pending.current > 0) first?.reject();
  }, [first]);
  return { track, declineOnClose };
}
