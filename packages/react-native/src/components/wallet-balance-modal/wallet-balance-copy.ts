import type { PollarLanguage } from '@pollar/core';

export const WALLET_BALANCE_COPY: Record<
  PollarLanguage,
  {
    title: string;
    refresh: string;
    close: string;
    network: string;
    copyWalletAddress: string;
    refreshing: string;
    loading: string;
    fetching: string;
    loadFailed: string;
    accountNotFound: string;
    empty: string;
    emptyWallet: string;
    nativeAsset: string;
    native: string;
    issuer: string;
    copyIssuer: string;
    needMore: string;
    getTestSol: string;
    getTestUsdc: string;
    available: string;
  }
> = {
  en: {
    title: 'Wallet Balance',
    refresh: 'Refresh',
    close: 'Close',
    network: 'Network',
    copyWalletAddress: 'Copy wallet address',
    refreshing: 'Refreshing balances…',
    loading: 'Loading…',
    fetching: 'Fetching balances…',
    loadFailed: 'Failed to load balances',
    accountNotFound: 'Account not found on {network}.',
    empty: 'No balances found on this network.',
    emptyWallet: 'No assets found in your wallet.',
    nativeAsset: 'Native asset',
    native: 'Native',
    issuer: 'Issuer: {issuer}',
    copyIssuer: 'Copy issuer address',
    needMore: 'Need more?',
    getTestSol: 'Get test SOL',
    getTestUsdc: 'Get test USDC',
    available: '{amount} available',
  },
  es: {
    title: 'Saldo de la billetera',
    refresh: 'Actualizar',
    close: 'Cerrar',
    network: 'Red',
    copyWalletAddress: 'Copiar dirección de la billetera',
    refreshing: 'Actualizando saldos…',
    loading: 'Cargando…',
    fetching: 'Obteniendo saldos…',
    loadFailed: 'No se pudieron cargar los saldos',
    accountNotFound: 'No se encontró la cuenta en {network}.',
    empty: 'No hay saldos en esta red.',
    emptyWallet: 'No hay activos en tu billetera.',
    nativeAsset: 'Activo nativo',
    native: 'Nativo',
    issuer: 'Emisor: {issuer}',
    copyIssuer: 'Copiar dirección del emisor',
    needMore: '¿Necesitas más?',
    getTestSol: 'Obtén SOL de prueba',
    getTestUsdc: 'Obtén USDC de prueba',
    available: '{amount} disponible',
  },
  pt: {
    title: 'Saldo da carteira',
    refresh: 'Atualizar',
    close: 'Fechar',
    network: 'Rede',
    copyWalletAddress: 'Copiar endereço da carteira',
    refreshing: 'Atualizando saldos…',
    loading: 'Carregando…',
    fetching: 'Buscando saldos…',
    loadFailed: 'Não foi possível carregar os saldos',
    accountNotFound: 'Conta não encontrada em {network}.',
    empty: 'Nenhum saldo nesta rede.',
    emptyWallet: 'Nenhum ativo na sua carteira.',
    nativeAsset: 'Ativo nativo',
    native: 'Nativo',
    issuer: 'Emissor: {issuer}',
    copyIssuer: 'Copiar endereço do emissor',
    needMore: 'Precisa de mais?',
    getTestSol: 'Obtenha SOL de teste',
    getTestUsdc: 'Obtenha USDC de teste',
    available: '{amount} disponível',
  },
};
