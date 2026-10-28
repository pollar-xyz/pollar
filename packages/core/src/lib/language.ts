/** Languages the SDK's modals are written in. */
export type PollarLanguage = 'en' | 'es' | 'pt';

/** The modal language a BCP 47 tag (`es-AR`, `pt-BR`, `en`) maps to, or `null` for one the modals lack. */
export function languageFromTag(tag: string | null | undefined): PollarLanguage | null {
  const base = (tag ?? '').toLowerCase().split(/[-_]/)[0];
  return base === 'en' || base === 'es' || base === 'pt' ? base : null;
}

/**
 * The language a modal shows, strongest first: the one the app pinned in the
 * dashboard (`device` pins none), the one its code asked for (a modal's own prop,
 * then the client's `locale`), then the user's device. English when none of them
 * is a language the modals have.
 */
export function resolveLanguage(sources: {
  dashboard?: string | null | undefined;
  code?: (string | null | undefined)[] | undefined;
  device?: string | null | undefined;
}): PollarLanguage {
  const dashboard = sources.dashboard === 'device' ? null : languageFromTag(sources.dashboard);
  if (dashboard) return dashboard;
  for (const tag of sources.code ?? []) {
    const language = languageFromTag(tag);
    if (language) return language;
  }
  return languageFromTag(sources.device) ?? 'en';
}

/**
 * A text in the language asked, else the closest one it has: Portuguese falls back
 * to Spanish before English, the other two to each other.
 */
export function localizedText(
  text: { en?: string; es?: string; pt?: string } | null | undefined,
  language: PollarLanguage,
): string {
  if (!text) return '';
  const order =
    language === 'pt'
      ? [text.pt, text.es, text.en]
      : language === 'es'
        ? [text.es, text.en, text.pt]
        : [text.en, text.es, text.pt];
  return order.find((value) => !!value) ?? '';
}
