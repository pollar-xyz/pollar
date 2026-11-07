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
      signIn: string;
    };
    /** A provider's sign-in: it proves the account is the user's, and moves nothing. */
    signIn: {
      body: string;
      noMoney: string;
      nothingSent: string;
    };
    earn: {
      deposit: string;
      withdraw: string;
      depositInto: (target: string) => string;
      withdrawFrom: (source: string) => string;
      depositAmount: (amount: string) => string;
      withdrawAmount: (amount: string) => string;
      /** The opportunity's place in the flow when its name is not known. */
      fallbackName: string;
      deposited: (amount: string, target: string, chain: string) => string;
      withdrew: (amount: string, source: string, chain: string) => string;
      depositedOn: (amount: string, chain: string) => string;
      withdrewOn: (amount: string, chain: string) => string;
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
      feeWallet: string;
      opportunity: string;
      apy: string;
      contract: string;
      method: string;
      asset: string;
      expiresIn: string;
      rawTx: string;
      txHash: string;
      deliversTo: string;
      call: (n: number) => string;
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
      signIn: "Confirm it's you",
    },
    signIn: {
      body: 'The payment provider needs to confirm this account is yours before it can process your order.',
      noMoney: 'No money moves',
      nothingSent: 'Nothing is sent',
    },
    earn: {
      deposit: 'Deposit',
      withdraw: 'Withdraw',
      depositInto: (target) => `Deposit into ${target}`,
      withdrawFrom: (source) => `Withdraw from ${source}`,
      depositAmount: (amount) => `Deposit ${amount}`,
      withdrawAmount: (amount) => `Withdraw ${amount}`,
      fallbackName: 'Earn',
      deposited: (amount, target, chain) => `Deposited ${amount} into the ${target} on ${chain}`,
      withdrew: (amount, source, chain) => `Withdrew ${amount} from the ${source} on ${chain}`,
      depositedOn: (amount, chain) => `Deposited ${amount} on ${chain}`,
      withdrewOn: (amount, chain) => `Withdrew ${amount} on ${chain}`,
    },
    yourWallet: 'Your wallet',
    newAccount: 'New account',
    atLeast: 'at least',
    approveNote: 'This only gives permission. Nothing moves yet.',
    feeSponsored: 'The app pays the network fee',
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
      feeWallet: 'Paid by your wallet',
      opportunity: 'Opportunity',
      apy: 'APY after fees',
      contract: 'Contract',
      method: 'Method',
      asset: 'Asset',
      expiresIn: 'Expires in',
      rawTx: 'Raw transaction',
      txHash: 'Transaction hash',
      deliversTo: 'Delivers to',
      call: (n) => `Call ${n}`,
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
      signIn: 'Confirma que eres tú',
    },
    signIn: {
      body: 'El proveedor de pagos necesita confirmar que esta cuenta es tuya antes de procesar tu orden.',
      noMoney: 'No se mueve dinero',
      nothingSent: 'No se envía nada',
    },
    earn: {
      deposit: 'Depositar',
      withdraw: 'Retirar',
      depositInto: (target) => `Depositar en ${target}`,
      withdrawFrom: (source) => `Retirar de ${source}`,
      depositAmount: (amount) => `Depositar ${amount}`,
      withdrawAmount: (amount) => `Retirar ${amount}`,
      fallbackName: 'Rendimientos',
      deposited: (amount, target, chain) => `Depositaste ${amount} en ${target}, en ${chain}`,
      withdrew: (amount, source, chain) => `Retiraste ${amount} de ${source}, en ${chain}`,
      depositedOn: (amount, chain) => `Depositaste ${amount} en ${chain}`,
      withdrewOn: (amount, chain) => `Retiraste ${amount} en ${chain}`,
    },
    yourWallet: 'Tu billetera',
    newAccount: 'Cuenta nueva',
    atLeast: 'al menos',
    approveNote: 'Solo das permiso. Todavía no se mueve nada.',
    feeSponsored: 'La app paga la comisión de red',
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
      feeWallet: 'La paga tu billetera',
      opportunity: 'Oportunidad',
      apy: 'APY después de comisiones',
      contract: 'Contrato',
      method: 'Método',
      asset: 'Activo',
      expiresIn: 'Vence en',
      rawTx: 'Transacción en bruto',
      txHash: 'Hash de la transacción',
      deliversTo: 'Entrega en',
      call: (n) => `Llamada ${n}`,
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
      signIn: 'Confirme que é você',
    },
    signIn: {
      body: 'O provedor de pagamentos precisa confirmar que esta conta é sua antes de processar seu pedido.',
      noMoney: 'Nenhum dinheiro se move',
      nothingSent: 'Nada é enviado',
    },
    earn: {
      deposit: 'Depositar',
      withdraw: 'Sacar',
      depositInto: (target) => `Depositar em ${target}`,
      withdrawFrom: (source) => `Sacar de ${source}`,
      depositAmount: (amount) => `Depositar ${amount}`,
      withdrawAmount: (amount) => `Sacar ${amount}`,
      fallbackName: 'Rendimentos',
      deposited: (amount, target, chain) => `Você depositou ${amount} em ${target}, na ${chain}`,
      withdrew: (amount, source, chain) => `Você sacou ${amount} de ${source}, na ${chain}`,
      depositedOn: (amount, chain) => `Você depositou ${amount} na ${chain}`,
      withdrewOn: (amount, chain) => `Você sacou ${amount} na ${chain}`,
    },
    yourWallet: 'Sua carteira',
    newAccount: 'Conta nova',
    atLeast: 'pelo menos',
    approveNote: 'Isto só dá permissão. Nada se move ainda.',
    feeSponsored: 'O app paga a taxa de rede',
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
      feeWallet: 'Paga pela sua carteira',
      opportunity: 'Oportunidade',
      apy: 'APY após taxas',
      contract: 'Contrato',
      method: 'Método',
      asset: 'Ativo',
      expiresIn: 'Expira em',
      rawTx: 'Transação bruta',
      txHash: 'Hash da transação',
      deliversTo: 'Entrega em',
      call: (n) => `Chamada ${n}`,
    },
    viewOnExplorer: 'Ver no explorador',
  },
};
