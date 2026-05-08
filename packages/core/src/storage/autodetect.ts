import { createLocalStorageAdapter, createMemoryAdapter, type LocalStorageAdapterOptions } from './web';
import type { Storage } from './types';

const PROBE_KEY = '__pollar_storage_probe__';

/**
 * Returns `localStorage`-backed storage when it works, otherwise an in-memory
 * fallback. The probe writes-reads-removes a sentinel; any throw, value
 * mismatch, or missing `localStorage` (SSR / disabled storage) falls back.
 *
 * Run-time degrade still happens inside `createLocalStorageAdapter` — see its
 * docstring for the rationale.
 */
export function defaultStorage(options: LocalStorageAdapterOptions = {}): Storage {
  if (typeof globalThis === 'undefined' || typeof globalThis.localStorage === 'undefined') {
    options.onDegrade?.('unavailable');
    return createMemoryAdapter();
  }

  try {
    const probeValue = String(Date.now());
    globalThis.localStorage.setItem(PROBE_KEY, probeValue);
    const read = globalThis.localStorage.getItem(PROBE_KEY);
    globalThis.localStorage.removeItem(PROBE_KEY);
    if (read !== probeValue) {
      options.onDegrade?.('probe-failed');
      return createMemoryAdapter();
    }
  } catch (error) {
    options.onDegrade?.('probe-failed', error);
    return createMemoryAdapter();
  }

  return createLocalStorageAdapter(options);
}
