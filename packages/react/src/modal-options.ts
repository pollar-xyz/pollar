import type { TransactionState } from '@pollar/core';
import { useCallback, useEffect, useRef, useState } from 'react';

/** The amount an `open*Modal` option asks for, when it is a plain decimal ("10", "10.5"); '' otherwise. */
export function seededAmount(amount: string | undefined): string {
  const value = amount?.trim() ?? '';
  return /^\d+(\.\d+)?$/.test(value) ? value : '';
}

/** The option whose asset code is `code`, compared without case; undefined when none is. */
export function byCode<T extends { code: string }>(options: readonly T[], code: string | undefined): T | undefined {
  const wanted = code?.trim().toUpperCase();
  return wanted ? options.find((o) => o.code.toUpperCase() === wanted) : undefined;
}

/** `value` when it is one of `allowed`, else undefined. */
export function oneOf<T>(allowed: readonly T[], value: T | undefined): T | undefined {
  return value !== undefined && allowed.includes(value) ? value : undefined;
}

/** Calls `onSuccess` once per transaction hash that succeeds while `active` (the modal on its transaction step). */
export function useSuccessReport(
  transaction: TransactionState,
  active: boolean,
  onSuccess: ((result: { hash: string }) => void) | undefined,
): void {
  const reported = useRef<string | null>(null);
  const hash = active && transaction.step === 'success' ? transaction.hash : null;
  useEffect(() => {
    if (!hash || reported.current === hash) return;
    reported.current = hash;
    onSuccess?.({ hash });
  }, [hash, onSuccess]);
}

/**
 * The options a modal was opened with, and a key that remounts it when it opens
 * on options, or on none after some, so no option outlives the call that gave it.
 * Opening on none after none keeps an open modal as it is.
 */
export function useModalOptions<T extends object>(): [{ options: T | undefined; key: number }, (options?: T) => void] {
  const [state, setState] = useState<{ options: T | undefined; key: number }>({ options: undefined, key: 0 });
  const seeded = useRef(false);
  const open = useCallback((options?: T) => {
    const given = options !== undefined && Object.keys(options).length > 0;
    const remount = given || seeded.current;
    seeded.current = given;
    setState((current) => ({ options: given ? options : undefined, key: remount ? current.key + 1 : current.key }));
  }, []);
  return [state, open];
}
