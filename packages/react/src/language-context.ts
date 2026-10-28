import { resolveLanguage, type PollarClient, type PollarLanguage } from '@pollar/core';
import { createContext, useContext, useMemo } from 'react';
import { deviceLanguage } from './components/commons-copy';
import { deviceLanguageTag } from './components/requirement-form-modal/form-fields';

/** The language the provider resolved for its modals; null outside a provider. */
export const ModalLanguageContext = createContext<PollarLanguage | null>(null);

/** The provider's language: the dashboard's pin, else the client's `locale`, else the device. */
export function useProviderLanguage(client: PollarClient, dashboard: string | undefined): PollarLanguage {
  // Optional: this package may run against a @pollar/core older than `locale`.
  const locale = typeof client.getLocale === 'function' ? client.getLocale() : undefined;
  return useMemo(() => resolveLanguage({ dashboard, code: [locale], device: deviceLanguageTag() }), [dashboard, locale]);
}

/**
 * The language of a shared building block (footer, copy button, amount field...):
 * its own prop, else the provider's, else the device's when it renders outside one.
 */
export function useInheritedLanguage(language?: PollarLanguage): PollarLanguage {
  const inherited = useContext(ModalLanguageContext);
  return language ?? inherited ?? deviceLanguage();
}
