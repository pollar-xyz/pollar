import type { PollarLanguage } from '@pollar/core';

export type TxReviewCopy = (typeof TX_REVIEW_COPY)[PollarLanguage];

export const TX_REVIEW_COPY: Record<
  PollarLanguage,
  {
    titles: {
      send: (amount: string) => string;
      bridge: (amount: string, chain: string) => string;
      approve: (asset: string, spender: string) => string;
      swap: (from: string, to: string) => string;
      payment: (amount: string, to: string) => string;
      createAccount: string;
    };
    yourWallet: string;
    newAccount: string;
    atLeast: string;
    approveNote: string;
    feeSponsored: string;
    feePaid: string;
    showDetails: string;
    hideDetails: string;
    chains: Record<'STELLAR' | 'POLYGON' | 'SOLANA', string>;
    rows: {
      description: string;
      network: string;
      from: string;
      to: string;
      amount: string;
      receiveMin: string;
      via: string;
      fee: string;
      feeCovered: string;
      contract: string;
      method: string;
      asset: string;
      expiresIn: string;
      rawTx: string;
      txHash: string;
    };
    viewOnExplorer: string;
  }
> = {
  en: {
    titles: {
      send: (amount) => `Send ${amount}`,
      bridge: (amount, chain) => `Move ${amount} to ${chain}`,
      approve: (asset, spender) => `Allow ${spender} to use your ${asset}`,
      swap: (from, to) => `Swap ${from} for ${to}`,
      payment: (amount, to) => `Pay ${amount} to ${to}`,
      createAccount: 'Create an account',
    },
    yourWallet: 'Your wallet',
    newAccount: 'New account',
    atLeast: 'at least',
    approveNote: 'This only gives permission. Nothing moves yet.',
    feeSponsored: 'Fee covered by the app',
    feePaid: 'You pay the network fee',
    showDetails: 'Show details',
    hideDetails: 'Hide details',
    chains: { STELLAR: 'Stellar', POLYGON: 'Polygon', SOLANA: 'Solana' },
    rows: {
      description: 'Description',
      network: 'Network',
      from: 'From',
      to: 'To',
      amount: 'Amount',
      receiveMin: 'Receive at least',
      via: 'Via',
      fee: 'Network fee',
      feeCovered: 'Covered by the app',
      contract: 'Contract',
      method: 'Method',
      asset: 'Asset',
      expiresIn: 'Expires in',
      rawTx: 'Raw transaction',
      txHash: 'Transaction hash',
    },
    viewOnExplorer: 'View on explorer',
  },
  es: {
    titles: {
      send: (amount) => `Enviar ${amount}`,
      bridge: (amount, chain) => `Mover ${amount} a ${chain}`,
      approve: (asset, spender) => `Permitir que ${spender} use tu ${asset}`,
      swap: (from, to) => `Cambiar ${from} por ${to}`,
      payment: (amount, to) => `Pagar ${amount} a ${to}`,
      createAccount: 'Crear una cuenta',
    },
    yourWallet: 'Tu billetera',
    newAccount: 'Cuenta nueva',
    atLeast: 'al menos',
    approveNote: 'Solo das permiso. Todavía no se mueve nada.',
    feeSponsored: 'La app cubre la comisión',
    feePaid: 'Tú pagas la comisión de red',
    showDetails: 'Ver detalles',
    hideDetails: 'Ocultar detalles',
    chains: { STELLAR: 'Stellar', POLYGON: 'Polygon', SOLANA: 'Solana' },
    rows: {
      description: 'Descripción',
      network: 'Red',
      from: 'Desde',
      to: 'Hacia',
      amount: 'Monto',
      receiveMin: 'Recibes al menos',
      via: 'Vía',
      fee: 'Comisión de red',
      feeCovered: 'La cubre la app',
      contract: 'Contrato',
      method: 'Método',
      asset: 'Activo',
      expiresIn: 'Vence en',
      rawTx: 'Transacción en bruto',
      txHash: 'Hash de la transacción',
    },
    viewOnExplorer: 'Ver en el explorador',
  },
  pt: {
    titles: {
      send: (amount) => `Enviar ${amount}`,
      bridge: (amount, chain) => `Mover ${amount} para ${chain}`,
      approve: (asset, spender) => `Permitir que ${spender} use seu ${asset}`,
      swap: (from, to) => `Trocar ${from} por ${to}`,
      payment: (amount, to) => `Pagar ${amount} para ${to}`,
      createAccount: 'Criar uma conta',
    },
    yourWallet: 'Sua carteira',
    newAccount: 'Conta nova',
    atLeast: 'pelo menos',
    approveNote: 'Isto só dá permissão. Nada se move ainda.',
    feeSponsored: 'O app cobre a taxa',
    feePaid: 'Você paga a taxa de rede',
    showDetails: 'Ver detalhes',
    hideDetails: 'Ocultar detalhes',
    chains: { STELLAR: 'Stellar', POLYGON: 'Polygon', SOLANA: 'Solana' },
    rows: {
      description: 'Descrição',
      network: 'Rede',
      from: 'De',
      to: 'Para',
      amount: 'Valor',
      receiveMin: 'Recebe pelo menos',
      via: 'Via',
      fee: 'Taxa de rede',
      feeCovered: 'Coberta pelo app',
      contract: 'Contrato',
      method: 'Método',
      asset: 'Ativo',
      expiresIn: 'Expira em',
      rawTx: 'Transação bruta',
      txHash: 'Hash da transação',
    },
    viewOnExplorer: 'Ver no explorador',
  },
};
