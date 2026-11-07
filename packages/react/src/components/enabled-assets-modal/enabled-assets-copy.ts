import type { PollarLanguage } from '@pollar/core';

export const ENABLED_ASSETS_COPY: Record<
  PollarLanguage,
  {
    title: string;
    refresh: string;
    close: string;
    back: string;
    network: string;
    copyWalletAddress: string;
    refreshing: string;
    loading: string;
    accountNotFound: string;
    empty: string;
    addCustom: string;
    appTag: string;
    copyIssuer: string;
    reserveSponsored: string;
    reserveSelfPaid: string;
    trustline: string;
    enableTrustlineFor: string;
    disableTrustlineFor: string;
    updateFailed: string;
    customTitle: string;
    customHint: string;
    assetCode: string;
    issuer: string;
    issuerInvalid: string;
    limit: string;
    optional: string;
    limitPlaceholder: string;
    enabling: string;
    enableTrustline: string;
  }
> = {
  en: {
    title: 'Assets',
    refresh: 'Refresh',
    close: 'Close',
    back: 'Back',
    network: 'Network',
    copyWalletAddress: 'Copy wallet address',
    refreshing: 'Refreshing assets…',
    loading: 'Loading…',
    accountNotFound: 'Account not found on {network}.',
    empty: 'No assets found on this network.',
    addCustom: '+ Add custom trustline',
    appTag: 'App',
    copyIssuer: 'Copy issuer address',
    reserveSponsored: 'Reserve sponsored by the app',
    reserveSelfPaid: 'You pay the reserve (~0.5 XLM)',
    trustline: 'Trustline',
    enableTrustlineFor: 'Enable {code} trustline',
    disableTrustlineFor: 'Disable {code} trustline',
    updateFailed: 'Trustline update failed. Please try again.',
    customTitle: 'Add custom trustline',
    customHint: "Custom trustlines aren't sponsored — your wallet pays the 0.5 XLM reserve and the transaction fee.",
    assetCode: 'Asset code',
    issuer: 'Issuer',
    issuerInvalid: 'Issuer must be a 56-character Stellar address starting with G.',
    limit: 'Limit',
    optional: '(optional)',
    limitPlaceholder: 'Maximum',
    enabling: 'Enabling…',
    enableTrustline: 'Enable trustline',
  },
  es: {
    title: 'Activos',
    refresh: 'Actualizar',
    close: 'Cerrar',
    back: 'Atrás',
    network: 'Red',
    copyWalletAddress: 'Copiar dirección de la billetera',
    refreshing: 'Actualizando activos…',
    loading: 'Cargando…',
    accountNotFound: 'No se encontró la cuenta en {network}.',
    empty: 'No hay activos en esta red.',
    addCustom: '+ Agregar línea de confianza personalizada',
    appTag: 'App',
    copyIssuer: 'Copiar dirección del emisor',
    reserveSponsored: 'La app patrocina la reserva',
    reserveSelfPaid: 'Tú pagas la reserva (~0.5 XLM)',
    trustline: 'Línea de confianza',
    enableTrustlineFor: 'Activar la línea de confianza de {code}',
    disableTrustlineFor: 'Desactivar la línea de confianza de {code}',
    updateFailed: 'No se pudo actualizar la línea de confianza. Intenta de nuevo.',
    customTitle: 'Agregar línea de confianza personalizada',
    customHint:
      'Las líneas de confianza personalizadas no están patrocinadas: tu billetera paga la reserva de 0.5 XLM y la comisión de la transacción.',
    assetCode: 'Código del activo',
    issuer: 'Emisor',
    issuerInvalid: 'El emisor debe ser una dirección de Stellar de 56 caracteres que empiece con G.',
    limit: 'Límite',
    optional: '(opcional)',
    limitPlaceholder: 'Máximo',
    enabling: 'Activando…',
    enableTrustline: 'Activar línea de confianza',
  },
  pt: {
    title: 'Ativos',
    refresh: 'Atualizar',
    close: 'Fechar',
    back: 'Voltar',
    network: 'Rede',
    copyWalletAddress: 'Copiar endereço da carteira',
    refreshing: 'Atualizando ativos…',
    loading: 'Carregando…',
    accountNotFound: 'Conta não encontrada em {network}.',
    empty: 'Nenhum ativo nesta rede.',
    addCustom: '+ Adicionar linha de confiança personalizada',
    appTag: 'App',
    copyIssuer: 'Copiar endereço do emissor',
    reserveSponsored: 'Reserva patrocinada pelo app',
    reserveSelfPaid: 'Você paga a reserva (~0.5 XLM)',
    trustline: 'Linha de confiança',
    enableTrustlineFor: 'Ativar a linha de confiança de {code}',
    disableTrustlineFor: 'Desativar a linha de confiança de {code}',
    updateFailed: 'Não foi possível atualizar a linha de confiança. Tente novamente.',
    customTitle: 'Adicionar linha de confiança personalizada',
    customHint:
      'Linhas de confiança personalizadas não são patrocinadas: sua carteira paga a reserva de 0.5 XLM e a taxa da transação.',
    assetCode: 'Código do ativo',
    issuer: 'Emissor',
    issuerInvalid: 'O emissor precisa ser um endereço Stellar de 56 caracteres começando com G.',
    limit: 'Limite',
    optional: '(opcional)',
    limitPlaceholder: 'Máximo',
    enabling: 'Ativando…',
    enableTrustline: 'Ativar linha de confiança',
  },
};
