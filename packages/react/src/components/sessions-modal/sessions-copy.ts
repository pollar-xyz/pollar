import type { PollarLanguage } from '@pollar/core';

export const SESSIONS_COPY: Record<
  PollarLanguage,
  {
    title: string;
    refresh: string;
    close: string;
    loading: string;
    empty: string;
    thisDevice: string;
    activeNow: string;
    otherDevices: string;
    signOutDevice: (device: string) => string;
    signingOut: string;
    signOutThisDevice: string;
    noOtherDevices: string;
    signOutEverywhere: string;
    unknownDevice: string;
    revokeFailed: string;
    justNow: string;
    secondsAgo: (n: number) => string;
    minutesAgo: (n: number) => string;
    hoursAgo: (n: number) => string;
    daysAgo: (n: number) => string;
  }
> = {
  en: {
    title: 'Active sessions',
    refresh: 'Refresh',
    close: 'Close',
    loading: 'Loading…',
    empty: 'No active sessions.',
    thisDevice: 'This device',
    activeNow: 'Active now',
    otherDevices: 'Other devices',
    signOutDevice: (device) => `Sign out ${device}`,
    signingOut: 'Signing out…',
    signOutThisDevice: 'Sign out this device',
    noOtherDevices: 'No other devices to sign out',
    signOutEverywhere: 'Sign out everywhere',
    unknownDevice: 'Unknown device',
    revokeFailed: 'Could not sign out that device. Please try again.',
    justNow: 'just now',
    secondsAgo: (n) => `${n}s ago`,
    minutesAgo: (n) => `${n}m ago`,
    hoursAgo: (n) => `${n}h ago`,
    daysAgo: (n) => `${n}d ago`,
  },
  es: {
    title: 'Sesiones activas',
    refresh: 'Actualizar',
    close: 'Cerrar',
    loading: 'Cargando…',
    empty: 'No hay sesiones activas.',
    thisDevice: 'Este dispositivo',
    activeNow: 'Activa ahora',
    otherDevices: 'Otros dispositivos',
    signOutDevice: (device) => `Cerrar sesión en ${device}`,
    signingOut: 'Cerrando sesión…',
    signOutThisDevice: 'Cerrar sesión en este dispositivo',
    noOtherDevices: 'No hay otros dispositivos donde cerrar sesión',
    signOutEverywhere: 'Cerrar sesión en todas partes',
    unknownDevice: 'Dispositivo desconocido',
    revokeFailed: 'No se pudo cerrar sesión en ese dispositivo. Intenta de nuevo.',
    justNow: 'justo ahora',
    secondsAgo: (n) => `hace ${n} s`,
    minutesAgo: (n) => `hace ${n} min`,
    hoursAgo: (n) => `hace ${n} h`,
    daysAgo: (n) => `hace ${n} d`,
  },
  pt: {
    title: 'Sessões ativas',
    refresh: 'Atualizar',
    close: 'Fechar',
    loading: 'Carregando…',
    empty: 'Nenhuma sessão ativa.',
    thisDevice: 'Este dispositivo',
    activeNow: 'Ativa agora',
    otherDevices: 'Outros dispositivos',
    signOutDevice: (device) => `Sair de ${device}`,
    signingOut: 'Saindo…',
    signOutThisDevice: 'Sair deste dispositivo',
    noOtherDevices: 'Não há outros dispositivos para sair',
    signOutEverywhere: 'Sair de todos os dispositivos',
    unknownDevice: 'Dispositivo desconhecido',
    revokeFailed: 'Não foi possível sair desse dispositivo. Tente novamente.',
    justNow: 'agora mesmo',
    secondsAgo: (n) => `há ${n} s`,
    minutesAgo: (n) => `há ${n} min`,
    hoursAgo: (n) => `há ${n} h`,
    daysAgo: (n) => `há ${n} d`,
  },
};
