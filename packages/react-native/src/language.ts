import { resolveLanguage, type PollarLanguage } from '@pollar/core';
import { useContext, useMemo } from 'react';
import { deviceLanguageTag } from './components/requirement-form-modal/form-fields';
import { usePollar } from './context';
import { ModalLanguageContext } from './language-context';

/**
 * The language a modal shows: the one pinned in the dashboard, else `language`
 * (the modal's own prop), else the provider's (its `language` prop, the client's
 * `locale`, the user's device).
 */
export function useModalLanguage(language?: string): PollarLanguage {
  const { styles } = usePollar();
  const provider = useContext(ModalLanguageContext);
  const dashboard = styles?.language;
  return useMemo(
    () => resolveLanguage({ dashboard, code: [language, provider], device: deviceLanguageTag() }),
    [dashboard, language, provider],
  );
}
