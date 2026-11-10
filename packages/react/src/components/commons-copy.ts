import { languageFromTag, type PollarLanguage } from '@pollar/core';
import { deviceLanguageTag } from './requirement-form-modal/form-fields';

/** The device's language: what a shared building block shows outside a provider (see `useInheritedLanguage`). */
export function deviceLanguage(): PollarLanguage {
  return languageFromTag(deviceLanguageTag()) ?? 'en';
}

/** Text of the building blocks every modal shares: footer, copy button, status banner, amount and pickers. */
export const COMMONS_COPY: Record<
  PollarLanguage,
  {
    protectedBy: string;
    copy: string;
    copied: string;
    cancel: string;
    retry: string;
    loading: string;
    max: string;
    available: string;
    assetAvailable: (code: string, amount: string) => string;
    appAssets: string;
    otherAssets: string;
    network: string;
  }
> = {
  en: {
    protectedBy: 'Protected by',
    copy: 'Copy',
    copied: 'Copied',
    cancel: 'Cancel',
    retry: 'Retry',
    loading: 'Loading…',
    max: 'Max',
    available: 'Available:',
    assetAvailable: (code, amount) => `${code} — ${amount} available`,
    appAssets: 'App assets',
    otherAssets: 'Other assets',
    network: 'Network',
  },
  es: {
    protectedBy: 'Protegido por',
    copy: 'Copiar',
    copied: 'Copiado',
    cancel: 'Cancelar',
    retry: 'Reintentar',
    loading: 'Cargando…',
    max: 'Máx.',
    available: 'Disponible:',
    assetAvailable: (code, amount) => `${code} — ${amount} disponible`,
    appAssets: 'Activos de la app',
    otherAssets: 'Otros activos',
    network: 'Red',
  },
  pt: {
    protectedBy: 'Protegido por',
    copy: 'Copiar',
    copied: 'Copiado',
    cancel: 'Cancelar',
    retry: 'Tentar de novo',
    loading: 'Carregando…',
    max: 'Máx.',
    available: 'Disponível:',
    assetAvailable: (code, amount) => `${code} — ${amount} disponível`,
    appAssets: 'Ativos do app',
    otherAssets: 'Outros ativos',
    network: 'Rede',
  },
};
