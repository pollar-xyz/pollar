import type { PollarLanguage } from '@pollar/core';

export const RECEIVE_COPY: Record<
  PollarLanguage,
  {
    title: string;
    close: string;
    network: string;
    locked: string;
    setupRecovery: string;
    wallet: string;
    networkBadge: string;
    qrTitle: string;
    copyAddress: string;
    copied: string;
    copy: string;
    onlySend: string;
    noWallet: string;
  }
> = {
  en: {
    title: 'Receive',
    close: 'Close',
    network: 'Network',
    locked:
      'Set up a way to recover this wallet before receiving funds. Without one, losing this device means losing whatever you receive, and nobody can get it back.',
    setupRecovery: 'Set up recovery',
    wallet: 'wallet',
    networkBadge: '{chain} network',
    qrTitle: '{chain} wallet QR code',
    copyAddress: 'Copy address',
    copied: 'Copied',
    copy: 'Copy',
    onlySend: 'Only send {chain} assets to this address',
    noWallet: 'No wallet connected.',
  },
  es: {
    title: 'Recibir',
    close: 'Cerrar',
    network: 'Red',
    locked:
      'Configura una forma de recuperar esta billetera antes de recibir fondos. Sin ella, si pierdes este dispositivo pierdes todo lo que recibas, y nadie podrá recuperarlo.',
    setupRecovery: 'Configurar recuperación',
    wallet: 'billetera',
    networkBadge: 'Red {chain}',
    qrTitle: 'Código QR de la billetera de {chain}',
    copyAddress: 'Copiar dirección',
    copied: 'Copiado',
    copy: 'Copiar',
    onlySend: 'Envía solo activos de {chain} a esta dirección',
    noWallet: 'No hay ninguna billetera conectada.',
  },
  pt: {
    title: 'Receber',
    close: 'Fechar',
    network: 'Rede',
    locked:
      'Configure uma forma de recuperar esta carteira antes de receber fundos. Sem ela, perder este dispositivo significa perder tudo o que você receber, e ninguém poderá recuperar.',
    setupRecovery: 'Configurar recuperação',
    wallet: 'carteira',
    networkBadge: 'Rede {chain}',
    qrTitle: 'QR code da carteira {chain}',
    copyAddress: 'Copiar endereço',
    copied: 'Copiado',
    copy: 'Copiar',
    onlySend: 'Envie apenas ativos da rede {chain} para este endereço',
    noWallet: 'Nenhuma carteira conectada.',
  },
};
