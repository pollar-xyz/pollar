import type { DistributionRule, PollarLanguage } from '@pollar/core';

export const DISTRIBUTION_RULES_COPY: Record<
  PollarLanguage,
  {
    title: string;
    refresh: string;
    close: string;
    loading: string;
    empty: string;
    loadFailed: string;
    claimFailed: string;
    claim: string;
    claiming: string;
    claimed: string;
    notAvailable: string;
    until: (date: string) => string;
    from: (date: string) => string;
    period: Record<DistributionRule['period'], string>;
    reasons: Record<string, string>;
  }
> = {
  en: {
    title: 'Distribution Rules',
    refresh: 'Refresh',
    close: 'Close',
    loading: 'Loading…',
    empty: 'No distribution rules available.',
    loadFailed: 'Failed to load distribution rules',
    claimFailed: 'Claim failed',
    claim: 'Claim',
    claiming: 'Claiming…',
    claimed: 'Claimed',
    notAvailable: 'Not available',
    until: (date) => `Until ${date}`,
    from: (date) => `From ${date}`,
    period: {
      DAY: 'every 24h',
      DAY_CALENDAR: 'daily',
      WEEK: 'every 7 days',
      MONTH: 'every 30 days',
      MONTH_CALENDAR: 'monthly',
      LIFETIME: 'one-time',
    },
    reasons: {
      DISTRIBUTION_RULE_DISABLED: 'Disabled',
      DISTRIBUTION_RULE_NOT_STARTED: 'Not started yet',
      DISTRIBUTION_RULE_EXPIRED: 'Expired',
      DISTRIBUTION_RULE_EXHAUSTED: 'Fully claimed',
      // Per-user, per-window claim limit (resets next period) - not permanent.
      DISTRIBUTION_RATE_LIMIT_EXCEEDED: 'Claimed for this period',
    },
  },
  es: {
    title: 'Reglas de distribución',
    refresh: 'Actualizar',
    close: 'Cerrar',
    loading: 'Cargando…',
    empty: 'No hay reglas de distribución disponibles.',
    loadFailed: 'No se pudieron cargar las reglas de distribución',
    claimFailed: 'No se pudo reclamar',
    claim: 'Reclamar',
    claiming: 'Reclamando…',
    claimed: 'Reclamado',
    notAvailable: 'No disponible',
    until: (date) => `Hasta el ${date}`,
    from: (date) => `Desde el ${date}`,
    period: {
      DAY: 'cada 24 h',
      DAY_CALENDAR: 'diario',
      WEEK: 'cada 7 días',
      MONTH: 'cada 30 días',
      MONTH_CALENDAR: 'mensual',
      LIFETIME: 'única vez',
    },
    reasons: {
      DISTRIBUTION_RULE_DISABLED: 'Desactivada',
      DISTRIBUTION_RULE_NOT_STARTED: 'Aún no comienza',
      DISTRIBUTION_RULE_EXPIRED: 'Vencida',
      DISTRIBUTION_RULE_EXHAUSTED: 'Agotada',
      DISTRIBUTION_RATE_LIMIT_EXCEEDED: 'Ya reclamado en este período',
    },
  },
  pt: {
    title: 'Regras de distribuição',
    refresh: 'Atualizar',
    close: 'Fechar',
    loading: 'Carregando…',
    empty: 'Nenhuma regra de distribuição disponível.',
    loadFailed: 'Não foi possível carregar as regras de distribuição',
    claimFailed: 'Não foi possível resgatar',
    claim: 'Resgatar',
    claiming: 'Resgatando…',
    claimed: 'Resgatado',
    notAvailable: 'Indisponível',
    until: (date) => `Até ${date}`,
    from: (date) => `A partir de ${date}`,
    period: {
      DAY: 'a cada 24 h',
      DAY_CALENDAR: 'diário',
      WEEK: 'a cada 7 dias',
      MONTH: 'a cada 30 dias',
      MONTH_CALENDAR: 'mensal',
      LIFETIME: 'uma única vez',
    },
    reasons: {
      DISTRIBUTION_RULE_DISABLED: 'Desativada',
      DISTRIBUTION_RULE_NOT_STARTED: 'Ainda não começou',
      DISTRIBUTION_RULE_EXPIRED: 'Expirada',
      DISTRIBUTION_RULE_EXHAUSTED: 'Esgotada',
      DISTRIBUTION_RATE_LIMIT_EXCEEDED: 'Já resgatado neste período',
    },
  },
};
