import { COUNTRY_NAMES } from './country-names.generated';

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

const LANGUAGE_INDEX: Record<PollarLanguage, 0 | 1 | 2> = { en: 0, es: 1, pt: 2 };

/**
 * A country's name in `language` from its ISO 3166-1 alpha-2 code: the engine's
 * Intl.DisplayNames, else the generated table (Hermes has no DisplayNames), else
 * the code as it came.
 */
export function countryName(code: string, language: PollarLanguage): string {
  const region = code.trim().toUpperCase();
  try {
    const name = new Intl.DisplayNames([language], { type: 'region', fallback: 'none' }).of(region);
    if (name) return name;
  } catch {
    // No Intl.DisplayNames, or a code it refuses: the table answers.
  }
  return COUNTRY_NAMES[region]?.[LANGUAGE_INDEX[language]] ?? code;
}
