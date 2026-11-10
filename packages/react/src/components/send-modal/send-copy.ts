import type { PollarLanguage } from '@pollar/core';

export const SEND_COPY: Record<
  PollarLanguage,
  {
    title: string;
    createAccountTitle: string;
    subtitle: string;
    anyNetwork: string;
    back: string;
    close: string;
    refresh: string;
    refreshBalances: string;
    network: string;
    asset: string;
    assets: string;
    loadingAssets: string;
    balanceUnavailable: string;
    available: string;
    noAssets: string;
    amount: string;
    destination: string;
    solanaAddress: string;
    paste: string;
    memo: string;
    optional: string;
    memoType: string;
    memoTypes: Record<'text' | 'id' | 'hash', string>;
    memoHashPlaceholder: string;
    memoTextPlaceholder: string;
    checkingDestination: string;
    continue: string;
    sendingUnavailable: string;
    accountMissingTitle: string;
    createNativeBefore: string;
    createNativeStrong: string;
    createNativeAfter: string;
    createNonNative: string;
    thisAsset: string;
    theAsset: string;
    minimumWarning: string;
    orWait: string;
    createWith: string;
    wait: string;
    tx: Record<
      | 'creatingAccount'
      | 'accountCreated'
      | 'createAccountFailed'
      | 'confirmCreateAccount'
      | 'sending'
      | 'sent'
      | 'sendFailed'
      | 'confirmSend',
      string
    >;
    errors: Record<
      | 'memoTextTooLong'
      | 'memoHashInvalid'
      | 'memoIdInvalid'
      | 'selectAsset'
      | 'invalidAmount'
      | 'insufficientBalance'
      | 'enterDestination'
      | 'tokenIncomplete'
      | 'amountUnreadable'
      | 'clipboardUnavailable'
      | 'clipboardEmpty'
      | 'clipboardFailed',
      string
    >;
  }
> = {
  en: {
    title: 'Send',
    createAccountTitle: 'Create account?',
    subtitle: 'Transfer assets to another {chain} wallet',
    anyNetwork: 'network',
    back: 'Back',
    close: 'Close',
    refresh: 'Refresh',
    refreshBalances: 'Refresh balances',
    network: 'Network',
    asset: 'Asset',
    assets: 'Assets',
    loadingAssets: 'Loading assets…',
    balanceUnavailable: 'Balance unavailable',
    available: '{amount} available',
    noAssets: 'No assets available',
    amount: 'Amount',
    destination: 'Destination wallet',
    solanaAddress: 'Solana address',
    paste: 'Paste',
    memo: 'Memo',
    optional: '(optional)',
    memoType: 'Memo type',
    memoTypes: { text: 'Text', id: 'ID', hash: 'Hash' },
    memoHashPlaceholder: '64 hex characters',
    memoTextPlaceholder: 'Up to 28 characters',
    checkingDestination: 'Checking destination…',
    continue: 'Continue',
    sendingUnavailable: 'Sending is not available on this network yet.',
    accountMissingTitle: "This account doesn't exist yet",
    createNativeBefore:
      'A Stellar account has to be created and funded before it can receive payments. Instead of a payment, this will',
    createNativeStrong: 'create the account',
    createNativeAfter: 'with {amount} XLM as its starting balance.',
    createNonNative:
      "It can't receive {asset} yet: it has to be created and funded with XLM first, and then add a trustline for {trustAsset}.",
    thisAsset: 'this asset',
    theAsset: 'the asset',
    minimumWarning: 'A new account needs a starting balance of at least {min} XLM. Go back and raise the amount to create it.',
    orWait: 'Or wait until another wallet funds it, and send afterwards.',
    createWith: 'Create account with {amount} XLM',
    wait: "I'll wait until it's funded",
    tx: {
      creatingAccount: 'Creating account…',
      accountCreated: 'Account created!',
      createAccountFailed: 'Create account failed',
      confirmCreateAccount: 'Confirm Create Account',
      sending: 'Sending…',
      sent: 'Sent!',
      sendFailed: 'Send failed',
      confirmSend: 'Confirm Send',
    },
    errors: {
      memoTextTooLong: 'The memo text can be at most 28 bytes.',
      memoHashInvalid: 'The memo hash must be 32 bytes as 64 hex characters.',
      memoIdInvalid: 'The memo ID must be a whole number up to 2^64 - 1.',
      selectAsset: 'Select an asset',
      invalidAmount: 'Enter a valid amount',
      insufficientBalance: 'Insufficient balance',
      enterDestination: 'Enter a destination address',
      tokenIncomplete: 'This token is missing its contract or decimals and cannot be sent.',
      amountUnreadable: 'Invalid amount',
      clipboardUnavailable: 'Clipboard access is not available. Paste the address manually.',
      clipboardEmpty: 'The clipboard is empty.',
      clipboardFailed: 'Could not read the clipboard. Paste the address manually.',
    },
  },
  es: {
    title: 'Enviar',
    createAccountTitle: '¿Crear la cuenta?',
    subtitle: 'Transfiere activos a otra billetera de {chain}',
    anyNetwork: 'la red',
    back: 'Atrás',
    close: 'Cerrar',
    refresh: 'Actualizar',
    refreshBalances: 'Actualizar saldos',
    network: 'Red',
    asset: 'Activo',
    assets: 'Activos',
    loadingAssets: 'Cargando activos…',
    balanceUnavailable: 'Saldo no disponible',
    available: '{amount} disponible',
    noAssets: 'No hay activos disponibles',
    amount: 'Monto',
    destination: 'Billetera de destino',
    solanaAddress: 'Dirección de Solana',
    paste: 'Pegar',
    memo: 'Memo',
    optional: '(opcional)',
    memoType: 'Tipo de memo',
    memoTypes: { text: 'Texto', id: 'ID', hash: 'Hash' },
    memoHashPlaceholder: '64 caracteres hexadecimales',
    memoTextPlaceholder: 'Hasta 28 caracteres',
    checkingDestination: 'Verificando el destino…',
    continue: 'Continuar',
    sendingUnavailable: 'Todavía no se pueden hacer envíos en esta red.',
    accountMissingTitle: 'Esta cuenta todavía no existe',
    createNativeBefore:
      'Una cuenta de Stellar tiene que crearse y fondearse antes de poder recibir pagos. En lugar de un pago, esto va a',
    createNativeStrong: 'crear la cuenta',
    createNativeAfter: 'con {amount} XLM como saldo inicial.',
    createNonNative:
      'Todavía no puede recibir {asset}: primero hay que crearla y fondearla con XLM, y luego agregar una línea de confianza para {trustAsset}.',
    thisAsset: 'este activo',
    theAsset: 'el activo',
    minimumWarning:
      'Una cuenta nueva necesita un saldo inicial de al menos {min} XLM. Vuelve atrás y sube el monto para crearla.',
    orWait: 'O espera a que otra billetera la fondee y envía después.',
    createWith: 'Crear la cuenta con {amount} XLM',
    wait: 'Esperaré a que la fondeen',
    tx: {
      creatingAccount: 'Creando la cuenta…',
      accountCreated: '¡Cuenta creada!',
      createAccountFailed: 'No se pudo crear la cuenta',
      confirmCreateAccount: 'Confirmar creación de cuenta',
      sending: 'Enviando…',
      sent: '¡Enviado!',
      sendFailed: 'No se pudo enviar',
      confirmSend: 'Confirmar envío',
    },
    errors: {
      memoTextTooLong: 'El texto del memo puede tener como máximo 28 bytes.',
      memoHashInvalid: 'El hash del memo debe tener 32 bytes, escritos como 64 caracteres hexadecimales.',
      memoIdInvalid: 'El ID del memo debe ser un número entero de hasta 2^64 - 1.',
      selectAsset: 'Elige un activo',
      invalidAmount: 'Ingresa un monto válido',
      insufficientBalance: 'Saldo insuficiente',
      enterDestination: 'Ingresa una dirección de destino',
      tokenIncomplete: 'A este token le falta su contrato o sus decimales y no se puede enviar.',
      amountUnreadable: 'Monto no válido',
      clipboardUnavailable: 'No hay acceso al portapapeles. Pega la dirección manualmente.',
      clipboardEmpty: 'El portapapeles está vacío.',
      clipboardFailed: 'No se pudo leer el portapapeles. Pega la dirección manualmente.',
    },
  },
  pt: {
    title: 'Enviar',
    createAccountTitle: 'Criar a conta?',
    subtitle: 'Transfira ativos para outra carteira {chain}',
    anyNetwork: 'da rede',
    back: 'Voltar',
    close: 'Fechar',
    refresh: 'Atualizar',
    refreshBalances: 'Atualizar saldos',
    network: 'Rede',
    asset: 'Ativo',
    assets: 'Ativos',
    loadingAssets: 'Carregando ativos…',
    balanceUnavailable: 'Saldo indisponível',
    available: '{amount} disponível',
    noAssets: 'Nenhum ativo disponível',
    amount: 'Valor',
    destination: 'Carteira de destino',
    solanaAddress: 'Endereço Solana',
    paste: 'Colar',
    memo: 'Memo',
    optional: '(opcional)',
    memoType: 'Tipo de memo',
    memoTypes: { text: 'Texto', id: 'ID', hash: 'Hash' },
    memoHashPlaceholder: '64 caracteres hexadecimais',
    memoTextPlaceholder: 'Até 28 caracteres',
    checkingDestination: 'Verificando o destino…',
    continue: 'Continuar',
    sendingUnavailable: 'Ainda não é possível enviar nesta rede.',
    accountMissingTitle: 'Esta conta ainda não existe',
    createNativeBefore:
      'Uma conta Stellar precisa ser criada e financiada antes de poder receber pagamentos. Em vez de um pagamento, isto vai',
    createNativeStrong: 'criar a conta',
    createNativeAfter: 'com {amount} XLM como saldo inicial.',
    createNonNative:
      'Ela ainda não pode receber {asset}: primeiro precisa ser criada e financiada com XLM e depois adicionar uma linha de confiança para {trustAsset}.',
    thisAsset: 'este ativo',
    theAsset: 'o ativo',
    minimumWarning: 'Uma conta nova precisa de um saldo inicial de pelo menos {min} XLM. Volte e aumente o valor para criá-la.',
    orWait: 'Ou espere até que outra carteira a financie e envie depois.',
    createWith: 'Criar a conta com {amount} XLM',
    wait: 'Vou esperar até que ela seja financiada',
    tx: {
      creatingAccount: 'Criando a conta…',
      accountCreated: 'Conta criada!',
      createAccountFailed: 'Não foi possível criar a conta',
      confirmCreateAccount: 'Confirmar criação da conta',
      sending: 'Enviando…',
      sent: 'Enviado!',
      sendFailed: 'Não foi possível enviar',
      confirmSend: 'Confirmar envio',
    },
    errors: {
      memoTextTooLong: 'O texto do memo pode ter no máximo 28 bytes.',
      memoHashInvalid: 'O hash do memo precisa ter 32 bytes, escritos como 64 caracteres hexadecimais.',
      memoIdInvalid: 'O ID do memo precisa ser um número inteiro de até 2^64 - 1.',
      selectAsset: 'Escolha um ativo',
      invalidAmount: 'Informe um valor válido',
      insufficientBalance: 'Saldo insuficiente',
      enterDestination: 'Informe um endereço de destino',
      tokenIncomplete: 'Este token está sem o contrato ou as casas decimais e não pode ser enviado.',
      amountUnreadable: 'Valor inválido',
      clipboardUnavailable: 'Não há acesso à área de transferência. Cole o endereço manualmente.',
      clipboardEmpty: 'A área de transferência está vazia.',
      clipboardFailed: 'Não foi possível ler a área de transferência. Cole o endereço manualmente.',
    },
  },
};
