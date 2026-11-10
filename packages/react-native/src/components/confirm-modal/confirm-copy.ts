import type { PollarLanguage } from '@pollar/core';

export const CONFIRM_COPY: Record<
  PollarLanguage,
  {
    whyTitle: string;
    whyBody: string;
    cancelAction: string;
    confirm: string;
    activateWallet: string;
    close: string;
    closeTitle: string;
    closeBody: string;
    backToSign: string;
    closeAndCancel: string;
    transaction: string;
    operations: Record<string, string>;
  }
> = {
  en: {
    whyTitle: 'Why am I seeing this?',
    whyBody: 'The app asks you to sign this with your wallet. Nothing is signed until you confirm.',
    cancelAction: 'Cancel this action',
    confirm: 'Confirm',
    activateWallet: 'Activate wallet',
    close: 'Close',
    closeTitle: 'Close without signing?',
    closeBody: "If you close, the app's action is canceled.",
    backToSign: 'Go back and sign',
    closeAndCancel: 'Close and cancel',
    transaction: 'Transaction',
    operations: {
      payment: 'Send',
      path_payment_strict_send: 'Swap',
      change_trust: 'Add asset',
      create_account: 'Create account',
      invoke_contract: 'Contract call',
      transfer: 'Authorize payment',
      manage_data: 'Manage data',
      earn_deposit: 'Deposit',
      earn_withdraw: 'Withdraw',
    },
  },
  es: {
    whyTitle: '¿Por qué ves esto?',
    whyBody: 'La app te pide firmar esto con tu billetera. No se firma nada hasta que confirmes.',
    cancelAction: 'Cancelar esta acción',
    confirm: 'Confirmar',
    activateWallet: 'Activar billetera',
    close: 'Cerrar',
    closeTitle: '¿Cerrar sin firmar?',
    closeBody: 'Si cierras, la acción de la app se cancela.',
    backToSign: 'Volver y firmar',
    closeAndCancel: 'Cerrar y cancelar',
    transaction: 'Transacción',
    operations: {
      payment: 'Enviar',
      path_payment_strict_send: 'Intercambiar',
      change_trust: 'Agregar activo',
      create_account: 'Crear cuenta',
      invoke_contract: 'Llamada a contrato',
      transfer: 'Autorizar pago',
      manage_data: 'Gestionar datos',
      earn_deposit: 'Depositar',
      earn_withdraw: 'Retirar',
    },
  },
  pt: {
    whyTitle: 'Por que estou vendo isto?',
    whyBody: 'O app pede que você assine isto com sua carteira. Nada é assinado até você confirmar.',
    cancelAction: 'Cancelar esta ação',
    confirm: 'Confirmar',
    activateWallet: 'Ativar carteira',
    close: 'Fechar',
    closeTitle: 'Fechar sem assinar?',
    closeBody: 'Se você fechar, a ação do app é cancelada.',
    backToSign: 'Voltar e assinar',
    closeAndCancel: 'Fechar e cancelar',
    transaction: 'Transação',
    operations: {
      payment: 'Enviar',
      path_payment_strict_send: 'Trocar',
      change_trust: 'Adicionar ativo',
      create_account: 'Criar conta',
      invoke_contract: 'Chamada de contrato',
      transfer: 'Autorizar pagamento',
      manage_data: 'Gerenciar dados',
      earn_deposit: 'Depositar',
      earn_withdraw: 'Sacar',
    },
  },
};
