import type { PollarLanguage } from '@pollar/core';

export const TX_HISTORY_COPY: Record<
  PollarLanguage,
  {
    title: string;
    refresh: string;
    close: string;
    network: string;
    copyWalletAddress: string;
    idle: string;
    loading: string;
    loadingHistory: string;
    loadFailed: string;
    empty: string;
    emptyFound: string;
    copyIssuer: string;
    copyContractAddress: string;
    invoke: string;
    sponsored: string;
    selfPaid: string;
    copyTxHash: string;
    viewOnExplorer: string;
    range: string;
    prev: string;
    next: string;
    transaction: string;
    status: Record<'PENDING' | 'SUCCESS' | 'FAILED', string>;
    /** Labels for `record.operation`; an id not listed shows as it arrived. */
    operations: Partial<Record<string, string>>;
  }
> = {
  en: {
    title: 'Transaction History',
    refresh: 'Refresh',
    close: 'Close',
    network: 'Network',
    copyWalletAddress: 'Copy wallet address',
    idle: 'Click Refresh to load transactions.',
    loading: 'Loading…',
    loadingHistory: 'Loading history…',
    loadFailed: 'Failed to load history',
    empty: 'No transactions yet.',
    emptyFound: 'No transactions found.',
    copyIssuer: 'Copy issuer',
    copyContractAddress: 'Copy contract address',
    invoke: 'Invoke {method}() on',
    sponsored: 'Sponsored',
    selfPaid: 'Self-paid',
    copyTxHash: 'Copy transaction hash',
    viewOnExplorer: 'View on block explorer',
    range: '{from}–{to} of {total}',
    prev: '← Prev',
    next: 'Next →',
    transaction: 'Transaction',
    status: { PENDING: 'Pending', SUCCESS: 'Success', FAILED: 'Failed' },
    // Empty: English shows the operation id as the API returns it.
    operations: {},
  },
  es: {
    title: 'Historial de transacciones',
    refresh: 'Actualizar',
    close: 'Cerrar',
    network: 'Red',
    copyWalletAddress: 'Copiar dirección de la billetera',
    idle: 'Toca Actualizar para cargar las transacciones.',
    loading: 'Cargando…',
    loadingHistory: 'Cargando el historial…',
    loadFailed: 'No se pudo cargar el historial',
    empty: 'Todavía no hay transacciones.',
    emptyFound: 'No se encontraron transacciones.',
    copyIssuer: 'Copiar emisor',
    copyContractAddress: 'Copiar dirección del contrato',
    invoke: 'Llamar a {method}() en',
    sponsored: 'Patrocinada',
    selfPaid: 'Pagada por ti',
    copyTxHash: 'Copiar hash de la transacción',
    viewOnExplorer: 'Ver en el explorador de bloques',
    range: '{from}–{to} de {total}',
    prev: '← Anterior',
    next: 'Siguiente →',
    transaction: 'Transacción',
    status: { PENDING: 'Pendiente', SUCCESS: 'Exitosa', FAILED: 'Fallida' },
    operations: {
      payment: 'pago',
      path_payment_strict_send: 'intercambio',
      change_trust: 'línea de confianza',
      create_account: 'crear cuenta',
      invoke_contract: 'llamada a contrato',
      manage_data: 'gestionar datos',
    },
  },
  pt: {
    title: 'Histórico de transações',
    refresh: 'Atualizar',
    close: 'Fechar',
    network: 'Rede',
    copyWalletAddress: 'Copiar endereço da carteira',
    idle: 'Toque em Atualizar para carregar as transações.',
    loading: 'Carregando…',
    loadingHistory: 'Carregando o histórico…',
    loadFailed: 'Não foi possível carregar o histórico',
    empty: 'Ainda não há transações.',
    emptyFound: 'Nenhuma transação encontrada.',
    copyIssuer: 'Copiar emissor',
    copyContractAddress: 'Copiar endereço do contrato',
    invoke: 'Chamar {method}() em',
    sponsored: 'Patrocinada',
    selfPaid: 'Paga por você',
    copyTxHash: 'Copiar hash da transação',
    viewOnExplorer: 'Ver no explorador de blocos',
    range: '{from}–{to} de {total}',
    prev: '← Anterior',
    next: 'Próxima →',
    transaction: 'Transação',
    status: { PENDING: 'Pendente', SUCCESS: 'Concluída', FAILED: 'Falhou' },
    operations: {
      payment: 'pagamento',
      path_payment_strict_send: 'troca',
      change_trust: 'linha de confiança',
      create_account: 'criar conta',
      invoke_contract: 'chamada de contrato',
      manage_data: 'gerenciar dados',
    },
  },
};
