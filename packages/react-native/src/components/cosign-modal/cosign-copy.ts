import type { PollarLanguage } from '@pollar/core';

export const COSIGN_COPY: Record<
  PollarLanguage,
  {
    title: string;
    close: string;
    status: Record<string, string>;
    sentTransaction: string;
    copy: string;
    copied: string;
    copyHash: string;
    copyFailed: string;
    signedAppSends: string;
    nothingSigned: string;
    nothingWaiting: string;
    next: (step: string) => string;
    closingIn: (seconds: number) => string;
    expired: string;
    expiresIn: string;
    checking: string;
    verified: string;
    checkedAgainstTurnkey: string;
    notVerified: string;
    reject: string;
    rejecting: string;
    approve: string;
    approving: string;
    genericError: string;
    transaction: string;
    rows: Record<'destination' | 'amount' | 'asset' | 'network', string>;
    operations: Record<string, string>;
  }
> = {
  en: {
    title: 'Confirm with your device',
    close: 'Close',
    status: { APPROVED: 'Approved', REJECTED: 'Rejected', EXPIRED: 'Expired', FAILED: 'Failed', PENDING: 'Pending' },
    sentTransaction: 'Sent. Transaction',
    copy: 'Copy',
    copied: 'Copied',
    copyHash: 'Copy transaction hash',
    copyFailed: 'Copy failed',
    signedAppSends: 'Signed. The app will send it.',
    nothingSigned: 'Nothing was signed.',
    nothingWaiting: 'Nothing waits for your approval.',
    next: (step) => `Next: ${step}. It appears here in a few seconds.`,
    closingIn: (seconds) => `Closing in ${seconds}s`,
    expired: 'expired',
    expiresIn: 'Expires in',
    checking: 'Checking...',
    verified: 'Verified',
    checkedAgainstTurnkey: 'Checked against Turnkey: this is exactly what will be signed.',
    notVerified: 'Not verified:',
    reject: 'Reject',
    rejecting: 'Rejecting...',
    approve: 'Approve',
    approving: 'Approving...',
    genericError: 'Something went wrong. Please try again.',
    transaction: 'Transaction',
    rows: { destination: 'Destination', amount: 'Amount', asset: 'Asset', network: 'Network' },
    operations: {
      payment: 'Send',
      path_payment_strict_send: 'Swap',
      change_trust: 'Add asset',
      create_account: 'Create account',
      invoke_contract: 'Contract call',
      soroban_auth: 'Authorize a contract call',
      manage_data: 'Manage data',
    },
  },
  es: {
    title: 'Confirma con tu dispositivo',
    close: 'Cerrar',
    status: { APPROVED: 'Aprobada', REJECTED: 'Rechazada', EXPIRED: 'Vencida', FAILED: 'Fallida', PENDING: 'Pendiente' },
    sentTransaction: 'Enviada. Transacción',
    copy: 'Copiar',
    copied: 'Copiado',
    copyHash: 'Copiar hash de la transacción',
    copyFailed: 'No se pudo copiar',
    signedAppSends: 'Firmada. La app la enviará.',
    nothingSigned: 'No se firmó nada.',
    nothingWaiting: 'No hay nada esperando tu aprobación.',
    next: (step) => `Siguiente: ${step}. Aparecerá aquí en unos segundos.`,
    closingIn: (seconds) => `Se cierra en ${seconds}s`,
    expired: 'vencida',
    expiresIn: 'Vence en',
    checking: 'Verificando...',
    verified: 'Verificada',
    checkedAgainstTurnkey: 'Verificada con Turnkey: esto es exactamente lo que se firmará.',
    notVerified: 'Sin verificar:',
    reject: 'Rechazar',
    rejecting: 'Rechazando...',
    approve: 'Aprobar',
    approving: 'Aprobando...',
    genericError: 'Algo salió mal. Intenta de nuevo.',
    transaction: 'Transacción',
    rows: { destination: 'Destino', amount: 'Monto', asset: 'Activo', network: 'Red' },
    operations: {
      payment: 'Enviar',
      path_payment_strict_send: 'Intercambiar',
      change_trust: 'Agregar activo',
      create_account: 'Crear cuenta',
      invoke_contract: 'Llamada a contrato',
      soroban_auth: 'Autorizar una llamada a contrato',
      manage_data: 'Gestionar datos',
    },
  },
  pt: {
    title: 'Confirme no seu dispositivo',
    close: 'Fechar',
    status: { APPROVED: 'Aprovada', REJECTED: 'Rejeitada', EXPIRED: 'Expirada', FAILED: 'Falhou', PENDING: 'Pendente' },
    sentTransaction: 'Enviada. Transação',
    copy: 'Copiar',
    copied: 'Copiado',
    copyHash: 'Copiar hash da transação',
    copyFailed: 'Não foi possível copiar',
    signedAppSends: 'Assinada. O app vai enviá-la.',
    nothingSigned: 'Nada foi assinado.',
    nothingWaiting: 'Nada aguarda a sua aprovação.',
    next: (step) => `Próximo: ${step}. Aparece aqui em alguns segundos.`,
    closingIn: (seconds) => `Fechando em ${seconds}s`,
    expired: 'expirada',
    expiresIn: 'Expira em',
    checking: 'Verificando...',
    verified: 'Verificada',
    checkedAgainstTurnkey: 'Conferida com a Turnkey: isto é exatamente o que será assinado.',
    notVerified: 'Não verificada:',
    reject: 'Rejeitar',
    rejecting: 'Rejeitando...',
    approve: 'Aprovar',
    approving: 'Aprovando...',
    genericError: 'Algo deu errado. Tente novamente.',
    transaction: 'Transação',
    rows: { destination: 'Destino', amount: 'Valor', asset: 'Ativo', network: 'Rede' },
    operations: {
      payment: 'Enviar',
      path_payment_strict_send: 'Trocar',
      change_trust: 'Adicionar ativo',
      create_account: 'Criar conta',
      invoke_contract: 'Chamada de contrato',
      soroban_auth: 'Autorizar uma chamada de contrato',
      manage_data: 'Gerenciar dados',
    },
  },
};
