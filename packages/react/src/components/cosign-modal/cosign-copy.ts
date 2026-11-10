import type { PollarLanguage } from '@pollar/core';

export const COSIGN_COPY: Record<
  PollarLanguage,
  {
    /** The header when no single request names the action. */
    title: string;
    manyPending: (count: number) => string;
    close: string;
    whyTitle: string;
    whyBody: string;
    rejectRequest: string;
    closeTitle: string;
    closeBody: string;
    backToSign: string;
    closeAnyway: string;
    activateWallet: string;
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
    checkedExact: string;
    notVerified: string;
    reject: string;
    rejecting: string;
    approve: string;
    approving: string;
    genericError: string;
    deviceNotLinked: string;
    linkDevice: string;
    transaction: string;
    operations: Record<string, string>;
  }
> = {
  en: {
    title: 'Approvals',
    manyPending: (count) => `${count} approvals waiting`,
    close: 'Close',
    whyTitle: 'Why am I seeing this?',
    whyBody: "Your wallet needs this device's signature. Neither the app nor Pollar can approve this without you.",
    rejectRequest: 'Reject this request',
    closeTitle: 'Close without signing?',
    closeBody: "The request stays pending. The app can't continue until you approve it.",
    backToSign: 'Go back and sign',
    closeAnyway: 'Close anyway',
    activateWallet: 'Activate wallet',
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
    verified: 'Checked',
    checkedExact: "We checked this is exactly what you're approving.",
    notVerified: 'Not verified:',
    reject: 'Reject',
    rejecting: 'Rejecting...',
    approve: 'Approve',
    approving: 'Approving...',
    genericError: 'Something went wrong. Please try again.',
    deviceNotLinked:
      "This device isn't linked to your wallet yet, so it can't approve. Add it with a device that already is, your passkey or your email.",
    linkDevice: 'Link this device',
    transaction: 'Transaction',
    operations: {
      payment: 'Send',
      path_payment_strict_send: 'Swap',
      change_trust: 'Add asset',
      create_account: 'Create account',
      invoke_contract: 'Contract call',
      soroban_auth: 'Authorize a contract call',
      manage_data: 'Manage data',
      transfer: 'Send',
      ramp_payment: 'Ramp payment',
      cctp_burn: 'Move USDC',
      swap: 'Swap',
      earn_deposit: 'Deposit',
      earn_withdraw: 'Withdraw',
      evm_delegation: 'Enable atomic transactions',
      provider_sign_in: "Confirm it's you",
      sep10: "Confirm it's you",
    },
  },
  es: {
    title: 'Aprobaciones',
    manyPending: (count) => `${count} aprobaciones pendientes`,
    close: 'Cerrar',
    whyTitle: '¿Por qué ves esto?',
    whyBody: 'Tu billetera necesita la firma de este dispositivo. Ni la app ni Pollar pueden aprobar esto sin ti.',
    rejectRequest: 'Rechazar esta solicitud',
    closeTitle: '¿Cerrar sin firmar?',
    closeBody: 'La solicitud queda pendiente. La app no puede seguir hasta que la apruebes.',
    backToSign: 'Volver y firmar',
    closeAnyway: 'Cerrar igual',
    activateWallet: 'Activar billetera',
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
    verified: 'Comprobada',
    checkedExact: 'Comprobamos que esto es exactamente lo que estás aprobando.',
    notVerified: 'Sin verificar:',
    reject: 'Rechazar',
    rejecting: 'Rechazando...',
    approve: 'Aprobar',
    approving: 'Aprobando...',
    genericError: 'Algo salió mal. Intenta de nuevo.',
    deviceNotLinked:
      'Este dispositivo aún no está vinculado a tu billetera, así que no puede aprobar. Agrégalo con un dispositivo que ya lo esté, tu passkey o tu email.',
    linkDevice: 'Vincular este dispositivo',
    transaction: 'Transacción',
    operations: {
      payment: 'Enviar',
      path_payment_strict_send: 'Intercambiar',
      change_trust: 'Agregar activo',
      create_account: 'Crear cuenta',
      invoke_contract: 'Llamada a contrato',
      soroban_auth: 'Autorizar una llamada a contrato',
      manage_data: 'Gestionar datos',
      transfer: 'Enviar',
      ramp_payment: 'Pago de rampa',
      cctp_burn: 'Mover USDC',
      swap: 'Intercambiar',
      earn_deposit: 'Depositar',
      earn_withdraw: 'Retirar',
      evm_delegation: 'Activar transacciones atómicas',
      provider_sign_in: 'Confirma que eres tú',
      sep10: 'Confirma que eres tú',
    },
  },
  pt: {
    title: 'Aprovações',
    manyPending: (count) => `${count} aprovações pendentes`,
    close: 'Fechar',
    whyTitle: 'Por que estou vendo isto?',
    whyBody: 'Sua carteira precisa da assinatura deste dispositivo. Nem o app nem a Pollar podem aprovar isto sem você.',
    rejectRequest: 'Rejeitar esta solicitação',
    closeTitle: 'Fechar sem assinar?',
    closeBody: 'A solicitação fica pendente. O app não pode continuar até você aprová-la.',
    backToSign: 'Voltar e assinar',
    closeAnyway: 'Fechar mesmo assim',
    activateWallet: 'Ativar carteira',
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
    verified: 'Conferida',
    checkedExact: 'Conferimos que isto é exatamente o que você está aprovando.',
    notVerified: 'Não verificada:',
    reject: 'Rejeitar',
    rejecting: 'Rejeitando...',
    approve: 'Aprovar',
    approving: 'Aprovando...',
    genericError: 'Algo deu errado. Tente novamente.',
    deviceNotLinked:
      'Este dispositivo ainda não está vinculado à sua carteira, então não pode aprovar. Adicione-o com um dispositivo que já esteja, sua passkey ou seu email.',
    linkDevice: 'Vincular este dispositivo',
    transaction: 'Transação',
    operations: {
      payment: 'Enviar',
      path_payment_strict_send: 'Trocar',
      change_trust: 'Adicionar ativo',
      create_account: 'Criar conta',
      invoke_contract: 'Chamada de contrato',
      soroban_auth: 'Autorizar uma chamada de contrato',
      manage_data: 'Gerenciar dados',
      transfer: 'Enviar',
      ramp_payment: 'Pagamento de rampa',
      cctp_burn: 'Mover USDC',
      swap: 'Trocar',
      earn_deposit: 'Depositar',
      earn_withdraw: 'Sacar',
      evm_delegation: 'Ativar transações atômicas',
      provider_sign_in: 'Confirme que é você',
      sep10: 'Confirme que é você',
    },
  },
};
