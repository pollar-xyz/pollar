import type { PendingConfirmation } from '@pollar/core';
import { useEffect } from 'react';
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
