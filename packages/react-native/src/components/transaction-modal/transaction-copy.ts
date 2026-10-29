import type { PollarLanguage, TransactionState } from '@pollar/core';

export const TRANSACTION_COPY: Record<
  PollarLanguage,
  {
    title: string;
    close: string;
    errorDetails: string;
    signAndSend: string;
    waitingFreighter: string;
    waitingAlbedo: string;
    signingAndSending: string;
    tryAgain: string;
    done: string;
    status: Record<TransactionState['step'], string>;
  }
> = {
  en: {
    title: 'Transaction',
    close: 'Close',
    errorDetails: 'Error details',
    signAndSend: 'Sign & Send',
    waitingFreighter: 'Waiting for Freighter…',
    waitingAlbedo: 'Waiting for Albedo…',
    signingAndSending: 'Signing and sending…',
    tryAgain: 'Try again',
    done: 'Done',
    status: {
      idle: '',
      building: 'Building transaction…',
      built: 'Ready to sign and send',
      signing: 'Signing transaction…',
      signed: 'Signed — ready to submit',
      submitting: 'Submitting transaction…',
      submitted: 'Submitted — waiting for confirmation…',
      'signing-submitting': 'Signing and submitting transaction…',
      awaiting_cosign: 'Waiting for your approval on this device…',
      'building-signing-submitting': 'Processing transaction…',
      success: 'Transaction sent successfully',
      error: 'Transaction failed',
    },
  },
  es: {
    title: 'Transacción',
    close: 'Cerrar',
    errorDetails: 'Detalles del error',
    signAndSend: 'Firmar y enviar',
    waitingFreighter: 'Esperando a Freighter…',
    waitingAlbedo: 'Esperando a Albedo…',
    signingAndSending: 'Firmando y enviando…',
    tryAgain: 'Intenta de nuevo',
    done: 'Listo',
    status: {
      idle: '',
      building: 'Preparando la transacción…',
      built: 'Lista para firmar y enviar',
      signing: 'Firmando la transacción…',
      signed: 'Firmada — lista para enviar',
      submitting: 'Enviando la transacción…',
      submitted: 'Enviada — esperando confirmación…',
      'signing-submitting': 'Firmando y enviando la transacción…',
      awaiting_cosign: 'Esperando tu aprobación en este dispositivo…',
      'building-signing-submitting': 'Procesando la transacción…',
      success: 'Transacción enviada con éxito',
      error: 'La transacción falló',
    },
  },
  pt: {
    title: 'Transação',
    close: 'Fechar',
    errorDetails: 'Detalhes do erro',
    signAndSend: 'Assinar e enviar',
    waitingFreighter: 'Aguardando o Freighter…',
    waitingAlbedo: 'Aguardando o Albedo…',
    signingAndSending: 'Assinando e enviando…',
    tryAgain: 'Tentar novamente',
    done: 'Concluir',
    status: {
      idle: '',
      building: 'Preparando a transação…',
      built: 'Pronta para assinar e enviar',
      signing: 'Assinando a transação…',
      signed: 'Assinada — pronta para enviar',
      submitting: 'Enviando a transação…',
      submitted: 'Enviada — aguardando confirmação…',
      'signing-submitting': 'Assinando e enviando a transação…',
      awaiting_cosign: 'Aguardando sua aprovação neste dispositivo…',
      'building-signing-submitting': 'Processando a transação…',
      success: 'Transação enviada com sucesso',
      error: 'A transação falhou',
    },
  },
};
