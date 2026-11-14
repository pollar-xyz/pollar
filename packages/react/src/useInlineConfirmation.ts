'use client';

import type { PendingConfirmation } from '@pollar/core';
import { useCallback, useEffect, useRef } from 'react';
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

/**
 * Closing a modal while its own signing call waits for the user's yes declines
 * that confirmation: the user left without signing. Left pending, it would
 * reopen as the provider's prompt over the page once the modal is gone. Only a
 * call wrapped in `track` counts, so a confirmation another flow queued is
 * never declined from here.
 */
export function useDeclineOnClose(confirmation: PendingConfirmation | null): {
  track: <T>(call: Promise<T>) => Promise<T>;
  declineOnClose: () => void;
} {
  const pending = useRef(0);
  const track = useCallback(async <T>(call: Promise<T>): Promise<T> => {
    pending.current += 1;
    try {
      return await call;
    } finally {
      pending.current -= 1;
    }
  }, []);
  const declineOnClose = useCallback(() => {
    if (pending.current > 0) confirmation?.reject();
  }, [confirmation]);
  return { track, declineOnClose };
}
