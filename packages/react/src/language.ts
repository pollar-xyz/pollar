import { resolveLanguage, type PollarLanguage } from '@pollar/core';
import { useMemo } from 'react';
import { deviceLanguageTag } from './components/requirement-form-modal/form-fields';
import { usePollar } from './context';

/**
 * The language a modal shows: the one pinned in the dashboard, else `language`
 * (the modal's own prop), else the client's `locale`, else the user's device.
 */
export function useModalLanguage(language?: string): PollarLanguage {
  const { getClient, styles } = usePollar();
  const client = getClient();
  // Optional: this package may run against a @pollar/core older than `locale`.
  const locale = typeof client.getLocale === 'function' ? client.getLocale() : undefined;
  const dashboard = styles?.language;
  return useMemo(
    () => resolveLanguage({ dashboard, code: [language, locale], device: deviceLanguageTag() }),
    [dashboard, language, locale],
  );
}
