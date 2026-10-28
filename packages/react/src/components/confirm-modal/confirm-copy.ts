import type { PollarLanguage } from '@pollar/core';

export const CONFIRM_COPY: Record<
  PollarLanguage,
  {
    title: string;
    intro: string;
    cancel: string;
    confirm: string;
    close: string;
    transaction: string;
    rows: Record<'destination' | 'amount' | 'asset' | 'network', string>;
    operations: Record<string, string>;
  }
> = {
  en: {
    title: 'Confirm transaction',
    intro: 'The app asks you to sign this transaction with your wallet.',
    cancel: 'Cancel',
    confirm: 'Confirm',
    close: 'Close',
    transaction: 'Transaction',
    rows: { destination: 'Destination', amount: 'Amount', asset: 'Asset', network: 'Network' },
    operations: {
      payment: 'Send',
      path_payment_strict_send: 'Swap',
      change_trust: 'Add asset',
      create_account: 'Create account',
      invoke_contract: 'Contract call',
      manage_data: 'Manage data',
    },
  },
  es: {
    title: 'Confirmar transacción',
    intro: 'La app te pide firmar esta transacción con tu billetera.',
    cancel: 'Cancelar',
    confirm: 'Confirmar',
    close: 'Cerrar',
    transaction: 'Transacción',
    rows: { destination: 'Destino', amount: 'Monto', asset: 'Activo', network: 'Red' },
    operations: {
      payment: 'Enviar',
      path_payment_strict_send: 'Intercambiar',
      change_trust: 'Agregar activo',
      create_account: 'Crear cuenta',
      invoke_contract: 'Llamada a contrato',
      manage_data: 'Gestionar datos',
    },
  },
  pt: {
    title: 'Confirmar transação',
    intro: 'O app pede que você assine esta transação com sua carteira.',
    cancel: 'Cancelar',
    confirm: 'Confirmar',
    close: 'Fechar',
    transaction: 'Transação',
    rows: { destination: 'Destino', amount: 'Valor', asset: 'Ativo', network: 'Rede' },
    operations: {
      payment: 'Enviar',
      path_payment_strict_send: 'Trocar',
      change_trust: 'Adicionar ativo',
      create_account: 'Criar conta',
      invoke_contract: 'Chamada de contrato',
      manage_data: 'Gerenciar dados',
    },
  },
};
