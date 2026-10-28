import type { CosignCustody, PollarLanguage } from '@pollar/core';

export interface RampCopy {
  /** Ramp failures a user can act on, by API code. */
  errors: Record<string, string>;
  loadRoutesFailed: string;
  readOrderFailed: string;
  accountNotApproved: string;
  amountInvalid: string;
  findRouteFailed: string;
  approveTrustline: (code: string) => string;
  addTrustlineFailed: (code: string) => string;
  addRecovery: string;
  approveAccount: string;
  noWalletCreation: string;
  prepareWalletFailed: string;
  routeGone: string;
  startOrderFailed: string;
  signingCancelled: string;
  resumeOrderFailed: string;
  checkPaymentFailed: string;
  retryOrderFailed: string;
  refreshFailed: string;
  copyFailed: string;
  awaitingAccount: string;
  connectStellarWallet: string;
  walletChanged: string;
  solanaWalletMismatch: string;
  steps: { amount: string; route: string; details: string; complete: string };
  stepOf: (position: number, total: number) => string;
  goTo: (step: string) => string;
  title: {
    buy: string;
    sell: string;
    finding: string;
    chooseRoute: string;
    details: string;
    completed: string;
    purchase: string;
    sale: string;
    error: string;
  };
  subtitle: {
    buy: string;
    sell: string;
    comparing: string;
    feesIncluded: string;
    needs: (items: string) => string;
    processing: string;
    error: string;
  };
  /** Joins the last two items of a list ("a, b and c"). */
  and: string;
  fewDetails: string;
  refresh: string;
  close: string;
  pendingAria: string;
  pendingNote: string;
  pendingNoteShort: string;
  resume: (onramp: boolean, id: string) => string;
  buy: string;
  sell: string;
  loadingRoutes: string;
  noChains: string;
  noRoutes: string;
  country: string;
  payWith: string;
  receiveIn: string;
  receive: string;
  assetOn: (code: string, chain: string) => string;
  youPay: string;
  youSell: string;
  findBestRoute: string;
  loadingSteps: [string, string, string];
  findingRoutes: string;
  changeAmount: string;
  back: string;
  optional: string;
  select: string;
  starting: string;
  continue: string;
  progress: string;
  inProgress: string;
  timeLeft: (seconds: number) => string;
  next: (approval: string) => string;
  youReceived: string;
  youReceive: string;
  whatToDo: string;
  setUpRecovery: string;
  recoveryNote: string;
  tryingAgain: string;
  tryAgain: string;
  order: string;
  copyOrderId: string;
  copy: string;
  copyLabel: (label: string) => string;
  payBefore: (time: string) => string;
  windowClosed: string;
  paymentQr: string;
  codeMissing: string;
  checkingPayment: string;
  paid: string;
  waitingWallet: string;
  authorize: string;
  preparingSignature: string;
  approveOnDevice: string;
  open: string;
  providerReviewing: string;
  serverTrouble: string;
  startAnother: string;
  keepsGoing: string;
  somethingWrong: string;
  routeSteps: (count: number) => string;
  feesIncluded: string;
  bestRate: string;
  needWallet: string;
  adding: string;
  addTrustline: (code: string) => string;
  custody: Record<CosignCustody, string>;
}

export const RAMP_COPY: Record<PollarLanguage, RampCopy> = {
  en: {
    errors: {
      SDK_RAMPS_QUOTE_EXPIRED: 'This quote expired. Find a route again.',
      SDK_RAMPS_QUOTE_NOT_FOUND: 'This quote is no longer available. Find a route again.',
      SDK_RAMPS_ACTION_STALE: 'This step changed. It was refreshed; try again.',
      SDK_RAMPS_TX_NOT_FOUND: 'This operation was not found.',
      SDK_RAMPS_WALLET_NOT_READY: 'Approve the new wallet account on your device, then try again.',
    },
    loadRoutesFailed: 'Could not load the ramp routes.',
    readOrderFailed: 'This operation could not be read.',
    accountNotApproved: 'The new account was not approved, so this route cannot start.',
    amountInvalid: 'Enter an amount greater than zero.',
    findRouteFailed: 'Could not find a route. Please try again.',
    approveTrustline: (code) => `Approve the ${code} trustline, then refresh the routes.`,
    addTrustlineFailed: (code) => `Could not add the ${code} trustline. Please try again.`,
    addRecovery: 'Add a way to recover your wallet, then find the route again.',
    approveAccount: 'Approve the new account, then find the route again.',
    noWalletCreation: 'This app does not create wallets.',
    prepareWalletFailed: 'Could not prepare the wallet. Please try again.',
    routeGone: 'That route is no longer available. Pick another one.',
    startOrderFailed: 'Could not start the operation. Please try again.',
    signingCancelled: 'Signing was cancelled.',
    resumeOrderFailed: 'Could not resume the operation.',
    checkPaymentFailed: 'Could not check the payment. Please try again.',
    retryOrderFailed: 'Could not try again. Please try again.',
    refreshFailed: 'Could not refresh.',
    copyFailed: 'Could not copy.',
    awaitingAccount: 'Approve the new account on your device. The order starts once it is approved.',
    connectStellarWallet: 'Connect the Stellar wallet this step was built for.',
    walletChanged: 'The connected wallet changed. Refresh before signing.',
    solanaWalletMismatch: 'This step must be signed by the Solana wallet it was built for. Reconnect that wallet.',
    steps: { amount: 'Amount', route: 'Route', details: 'Details', complete: 'Complete' },
    stepOf: (position, total) => `Step ${position} of ${total}`,
    goTo: (step) => `Go to ${step}`,
    title: {
      buy: 'Buy crypto',
      sell: 'Sell crypto',
      finding: 'Finding the best route',
      chooseRoute: 'Choose a route',
      details: 'Your details',
      completed: 'Transfer completed',
      purchase: 'Your purchase',
      sale: 'Your sale',
      error: 'Something went wrong',
    },
    subtitle: {
      buy: 'Pick what you receive and how much you pay',
      sell: 'Pick what you sell and how much',
      comparing: 'Comparing routes in real time…',
      feesIncluded: 'All amounts include fees',
      needs: (items) => `This route needs ${items} to continue`,
      processing: 'Processing',
      error: 'Please try again',
    },
    and: 'and',
    fewDetails: 'a few details',
    refresh: 'Refresh',
    close: 'Close',
    pendingAria: 'Pending operations',
    pendingNote: 'These operations are waiting for you. Starting another does not cancel them.',
    pendingNoteShort: 'These operations are waiting for you:',
    resume: (onramp, id) => `Resume ${onramp ? 'purchase' : 'sale'} · ${id}`,
    buy: 'Buy',
    sell: 'Sell',
    loadingRoutes: 'Loading routes…',
    noChains: 'This app has no chains enabled, so there is nothing to buy or sell yet.',
    noRoutes: 'No ramp routes are available for this app yet.',
    country: 'Country',
    payWith: 'Pay with',
    receiveIn: 'Receive in',
    receive: 'Receive',
    assetOn: (code, chain) => `${code} on ${chain}`,
    youPay: 'You pay',
    youSell: 'You sell',
    findBestRoute: 'Find best route',
    loadingSteps: ['Checking routes…', 'Quoting each step…', 'Route found!'],
    findingRoutes: 'Finding routes…',
    changeAmount: 'Change amount',
    back: 'Back',
    optional: 'optional',
    select: 'Select…',
    starting: 'Starting…',
    continue: 'Continue',
    progress: 'Progress',
    inProgress: 'In progress',
    timeLeft: (seconds) =>
      seconds <= 0
        ? 'Taking a little longer than usual'
        : seconds < 60
          ? `About ${seconds}s left`
          : `About ${Math.ceil(seconds / 60)} min left`,
    next: (approval) => `Next: ${approval}. You approve it on this device when it comes up.`,
    youReceived: 'You received',
    youReceive: 'You receive',
    whatToDo: 'What to do',
    setUpRecovery: 'Set up recovery',
    recoveryNote: 'Once it is set up, the order goes on by itself.',
    tryingAgain: 'Trying again…',
    tryAgain: 'Try again',
    order: 'Order',
    copyOrderId: 'Copy order id',
    copy: 'Copy',
    copyLabel: (label) => `Copy ${label}`,
    payBefore: (time) => `Pay before ${time}.`,
    windowClosed: 'This payment window has closed. If you have not paid, start a new operation.',
    paymentQr: 'Payment QR',
    codeMissing: "The payment code could not be shown. Refresh; if it still does not appear, contact this app's support.",
    checkingPayment: 'Checking your payment...',
    paid: "I've paid",
    waitingWallet: 'Waiting for your wallet…',
    authorize: 'Authorize',
    preparingSignature: 'Preparing a new signature request…',
    approveOnDevice: 'Approve on this device',
    open: 'Open',
    providerReviewing: 'The provider is reviewing your details. This updates on its own.',
    serverTrouble: 'Having trouble reaching the server. Retrying…',
    startAnother: 'Start another operation',
    keepsGoing: 'This one keeps going; you can resume it later.',
    somethingWrong: 'Something went wrong.',
    routeSteps: (count) => (count === 1 ? '1 step' : `${count} steps`),
    feesIncluded: 'fees included',
    bestRate: 'Best rate',
    needWallet: 'You need a wallet to receive this. Create it from the wallet menu, then find the route again.',
    adding: 'Adding…',
    addTrustline: (code) => `Add ${code} trustline`,
    custody: { COSIGNED: 'co-signed', SELF_CUSTODY: 'self-custody' },
  },
  es: {
    errors: {
      SDK_RAMPS_QUOTE_EXPIRED: 'Esta cotización venció. Busca una ruta de nuevo.',
      SDK_RAMPS_QUOTE_NOT_FOUND: 'Esta cotización ya no está disponible. Busca una ruta de nuevo.',
      SDK_RAMPS_ACTION_STALE: 'Este paso cambió y se actualizó. Intenta de nuevo.',
      SDK_RAMPS_TX_NOT_FOUND: 'No se encontró esta operación.',
      SDK_RAMPS_WALLET_NOT_READY: 'Aprueba la nueva cuenta de la billetera en tu dispositivo e intenta de nuevo.',
    },
    loadRoutesFailed: 'No se pudieron cargar las rutas.',
    readOrderFailed: 'No se pudo leer esta operación.',
    accountNotApproved: 'La nueva cuenta no fue aprobada, así que esta ruta no puede comenzar.',
    amountInvalid: 'Ingresa un monto mayor que cero.',
    findRouteFailed: 'No se pudo encontrar una ruta. Intenta de nuevo.',
    approveTrustline: (code) => `Aprueba la trustline de ${code} y luego actualiza las rutas.`,
    addTrustlineFailed: (code) => `No se pudo agregar la trustline de ${code}. Intenta de nuevo.`,
    addRecovery: 'Agrega una forma de recuperar tu billetera y luego busca la ruta de nuevo.',
    approveAccount: 'Aprueba la nueva cuenta y luego busca la ruta de nuevo.',
    noWalletCreation: 'Esta app no crea billeteras.',
    prepareWalletFailed: 'No se pudo preparar la billetera. Intenta de nuevo.',
    routeGone: 'Esa ruta ya no está disponible. Elige otra.',
    startOrderFailed: 'No se pudo iniciar la operación. Intenta de nuevo.',
    signingCancelled: 'Se canceló la firma.',
    resumeOrderFailed: 'No se pudo retomar la operación.',
    checkPaymentFailed: 'No se pudo verificar el pago. Intenta de nuevo.',
    retryOrderFailed: 'No se pudo reintentar. Intenta de nuevo.',
    refreshFailed: 'No se pudo actualizar.',
    copyFailed: 'No se pudo copiar.',
    awaitingAccount: 'Aprueba la nueva cuenta en tu dispositivo. La orden comienza cuando la apruebes.',
    connectStellarWallet: 'Conecta la billetera de Stellar para la que se preparó este paso.',
    walletChanged: 'La billetera conectada cambió. Actualiza antes de firmar.',
    solanaWalletMismatch: 'Este paso debe firmarlo la billetera de Solana para la que se preparó. Vuelve a conectarla.',
    steps: { amount: 'Monto', route: 'Ruta', details: 'Datos', complete: 'Listo' },
    stepOf: (position, total) => `Paso ${position} de ${total}`,
    goTo: (step) => `Ir a ${step}`,
    title: {
      buy: 'Comprar cripto',
      sell: 'Vender cripto',
      finding: 'Buscando la mejor ruta',
      chooseRoute: 'Elige una ruta',
      details: 'Tus datos',
      completed: 'Transferencia completada',
      purchase: 'Tu compra',
      sale: 'Tu venta',
      error: 'Algo salió mal',
    },
    subtitle: {
      buy: 'Elige qué recibes y cuánto pagas',
      sell: 'Elige qué vendes y cuánto',
      comparing: 'Comparando rutas en tiempo real…',
      feesIncluded: 'Todos los montos incluyen comisiones',
      needs: (items) => `Esta ruta necesita ${items} para continuar`,
      processing: 'Procesando',
      error: 'Intenta de nuevo',
    },
    and: 'y',
    fewDetails: 'algunos datos',
    refresh: 'Actualizar',
    close: 'Cerrar',
    pendingAria: 'Operaciones pendientes',
    pendingNote: 'Estas operaciones te están esperando. Iniciar otra no las cancela.',
    pendingNoteShort: 'Estas operaciones te están esperando:',
    resume: (onramp, id) => `Retomar ${onramp ? 'compra' : 'venta'} · ${id}`,
    buy: 'Comprar',
    sell: 'Vender',
    loadingRoutes: 'Cargando rutas…',
    noChains: 'Esta app no tiene redes habilitadas, así que todavía no hay nada para comprar ni vender.',
    noRoutes: 'Esta app todavía no tiene rutas disponibles.',
    country: 'País',
    payWith: 'Pagar con',
    receiveIn: 'Recibir en',
    receive: 'Recibir',
    assetOn: (code, chain) => `${code} en ${chain}`,
    youPay: 'Pagas',
    youSell: 'Vendes',
    findBestRoute: 'Buscar la mejor ruta',
    loadingSteps: ['Revisando rutas…', 'Cotizando cada paso…', '¡Ruta encontrada!'],
    findingRoutes: 'Buscando rutas…',
    changeAmount: 'Cambiar monto',
    back: 'Volver',
    optional: 'opcional',
    select: 'Selecciona…',
    starting: 'Iniciando…',
    continue: 'Continuar',
    progress: 'Progreso',
    inProgress: 'En curso',
    timeLeft: (seconds) =>
      seconds <= 0
        ? 'Está tardando un poco más de lo normal'
        : seconds < 60
          ? `Faltan unos ${seconds} s`
          : `Faltan unos ${Math.ceil(seconds / 60)} min`,
    next: (approval) => `Siguiente: ${approval}. Lo apruebas en este dispositivo cuando aparezca.`,
    youReceived: 'Recibiste',
    youReceive: 'Recibes',
    whatToDo: 'Qué hacer',
    setUpRecovery: 'Configurar recuperación',
    recoveryNote: 'Cuando esté configurada, la orden sigue sola.',
    tryingAgain: 'Reintentando…',
    tryAgain: 'Intentar de nuevo',
    order: 'Orden',
    copyOrderId: 'Copiar ID de la orden',
    copy: 'Copiar',
    copyLabel: (label) => `Copiar ${label}`,
    payBefore: (time) => `Paga antes de las ${time}.`,
    windowClosed: 'El plazo para pagar terminó. Si no pagaste, inicia una nueva operación.',
    paymentQr: 'QR de pago',
    codeMissing: 'No se pudo mostrar el código de pago. Actualiza; si sigue sin aparecer, contacta al soporte de esta app.',
    checkingPayment: 'Verificando tu pago...',
    paid: 'Ya pagué',
    waitingWallet: 'Esperando tu billetera…',
    authorize: 'Autorizar',
    preparingSignature: 'Preparando una nueva solicitud de firma…',
    approveOnDevice: 'Aprobar en este dispositivo',
    open: 'Abrir',
    providerReviewing: 'El proveedor está revisando tus datos. Esto se actualiza solo.',
    serverTrouble: 'Hay problemas para conectar con el servidor. Reintentando…',
    startAnother: 'Iniciar otra operación',
    keepsGoing: 'Esta sigue en curso; puedes retomarla más tarde.',
    somethingWrong: 'Algo salió mal.',
    routeSteps: (count) => (count === 1 ? '1 paso' : `${count} pasos`),
    feesIncluded: 'comisiones incluidas',
    bestRate: 'Mejor tasa',
    needWallet:
      'Necesitas una billetera para recibir esto. Créala desde el menú de la billetera y luego busca la ruta de nuevo.',
    adding: 'Agregando…',
    addTrustline: (code) => `Agregar trustline de ${code}`,
    custody: { COSIGNED: 'cofirmada', SELF_CUSTODY: 'autocustodia' },
  },
  pt: {
    errors: {
      SDK_RAMPS_QUOTE_EXPIRED: 'Esta cotação expirou. Busque uma rota de novo.',
      SDK_RAMPS_QUOTE_NOT_FOUND: 'Esta cotação não está mais disponível. Busque uma rota de novo.',
      SDK_RAMPS_ACTION_STALE: 'Esta etapa mudou e foi atualizada. Tente de novo.',
      SDK_RAMPS_TX_NOT_FOUND: 'Esta operação não foi encontrada.',
      SDK_RAMPS_WALLET_NOT_READY: 'Aprove a nova conta da carteira no seu dispositivo e tente de novo.',
    },
    loadRoutesFailed: 'Não foi possível carregar as rotas.',
    readOrderFailed: 'Não foi possível ler esta operação.',
    accountNotApproved: 'A nova conta não foi aprovada, então esta rota não pode começar.',
    amountInvalid: 'Informe um valor maior que zero.',
    findRouteFailed: 'Não foi possível encontrar uma rota. Tente de novo.',
    approveTrustline: (code) => `Aprove a trustline de ${code} e depois atualize as rotas.`,
    addTrustlineFailed: (code) => `Não foi possível adicionar a trustline de ${code}. Tente de novo.`,
    addRecovery: 'Adicione uma forma de recuperar sua carteira e depois busque a rota de novo.',
    approveAccount: 'Aprove a nova conta e depois busque a rota de novo.',
    noWalletCreation: 'Este app não cria carteiras.',
    prepareWalletFailed: 'Não foi possível preparar a carteira. Tente de novo.',
    routeGone: 'Essa rota não está mais disponível. Escolha outra.',
    startOrderFailed: 'Não foi possível iniciar a operação. Tente de novo.',
    signingCancelled: 'A assinatura foi cancelada.',
    resumeOrderFailed: 'Não foi possível retomar a operação.',
    checkPaymentFailed: 'Não foi possível verificar o pagamento. Tente de novo.',
    retryOrderFailed: 'Não foi possível tentar de novo. Tente de novo.',
    refreshFailed: 'Não foi possível atualizar.',
    copyFailed: 'Não foi possível copiar.',
    awaitingAccount: 'Aprove a nova conta no seu dispositivo. A ordem começa assim que você aprovar.',
    connectStellarWallet: 'Conecte a carteira Stellar para a qual esta etapa foi preparada.',
    walletChanged: 'A carteira conectada mudou. Atualize antes de assinar.',
    solanaWalletMismatch:
      'Esta etapa precisa ser assinada pela carteira Solana para a qual foi preparada. Conecte essa carteira de novo.',
    steps: { amount: 'Valor', route: 'Rota', details: 'Dados', complete: 'Concluído' },
    stepOf: (position, total) => `Etapa ${position} de ${total}`,
    goTo: (step) => `Ir para ${step}`,
    title: {
      buy: 'Comprar cripto',
      sell: 'Vender cripto',
      finding: 'Buscando a melhor rota',
      chooseRoute: 'Escolha uma rota',
      details: 'Seus dados',
      completed: 'Transferência concluída',
      purchase: 'Sua compra',
      sale: 'Sua venda',
      error: 'Algo deu errado',
    },
    subtitle: {
      buy: 'Escolha o que você recebe e quanto paga',
      sell: 'Escolha o que você vende e quanto',
      comparing: 'Comparando rotas em tempo real…',
      feesIncluded: 'Todos os valores incluem taxas',
      needs: (items) => `Esta rota precisa de ${items} para continuar`,
      processing: 'Processando',
      error: 'Tente de novo',
    },
    and: 'e',
    fewDetails: 'alguns dados',
    refresh: 'Atualizar',
    close: 'Fechar',
    pendingAria: 'Operações pendentes',
    pendingNote: 'Estas operações estão esperando por você. Iniciar outra não as cancela.',
    pendingNoteShort: 'Estas operações estão esperando por você:',
    resume: (onramp, id) => `Retomar ${onramp ? 'compra' : 'venda'} · ${id}`,
    buy: 'Comprar',
    sell: 'Vender',
    loadingRoutes: 'Carregando rotas…',
    noChains: 'Este app não tem redes habilitadas, então ainda não há nada para comprar ou vender.',
    noRoutes: 'Este app ainda não tem rotas disponíveis.',
    country: 'País',
    payWith: 'Pagar com',
    receiveIn: 'Receber em',
    receive: 'Receber',
    assetOn: (code, chain) => `${code} na ${chain}`,
    youPay: 'Você paga',
    youSell: 'Você vende',
    findBestRoute: 'Buscar a melhor rota',
    loadingSteps: ['Verificando rotas…', 'Cotando cada etapa…', 'Rota encontrada!'],
    findingRoutes: 'Buscando rotas…',
    changeAmount: 'Alterar valor',
    back: 'Voltar',
    optional: 'opcional',
    select: 'Selecione…',
    starting: 'Iniciando…',
    continue: 'Continuar',
    progress: 'Progresso',
    inProgress: 'Em andamento',
    timeLeft: (seconds) =>
      seconds <= 0
        ? 'Está demorando um pouco mais que o normal'
        : seconds < 60
          ? `Faltam cerca de ${seconds} s`
          : `Faltam cerca de ${Math.ceil(seconds / 60)} min`,
    next: (approval) => `Próximo: ${approval}. Você aprova neste dispositivo quando aparecer.`,
    youReceived: 'Você recebeu',
    youReceive: 'Você recebe',
    whatToDo: 'O que fazer',
    setUpRecovery: 'Configurar recuperação',
    recoveryNote: 'Assim que estiver configurada, a ordem continua sozinha.',
    tryingAgain: 'Tentando de novo…',
    tryAgain: 'Tentar de novo',
    order: 'Ordem',
    copyOrderId: 'Copiar ID da ordem',
    copy: 'Copiar',
    copyLabel: (label) => `Copiar ${label}`,
    payBefore: (time) => `Pague antes das ${time}.`,
    windowClosed: 'O prazo para pagar terminou. Se você não pagou, inicie uma nova operação.',
    paymentQr: 'QR de pagamento',
    codeMissing:
      'Não foi possível mostrar o código de pagamento. Atualize; se ainda não aparecer, fale com o suporte deste app.',
    checkingPayment: 'Verificando seu pagamento...',
    paid: 'Já paguei',
    waitingWallet: 'Aguardando sua carteira…',
    authorize: 'Autorizar',
    preparingSignature: 'Preparando uma nova solicitação de assinatura…',
    approveOnDevice: 'Aprovar neste dispositivo',
    open: 'Abrir',
    providerReviewing: 'O provedor está analisando seus dados. Isto se atualiza sozinho.',
    serverTrouble: 'Problemas para conectar ao servidor. Tentando de novo…',
    startAnother: 'Iniciar outra operação',
    keepsGoing: 'Esta continua em andamento; você pode retomá-la depois.',
    somethingWrong: 'Algo deu errado.',
    routeSteps: (count) => (count === 1 ? '1 etapa' : `${count} etapas`),
    feesIncluded: 'taxas incluídas',
    bestRate: 'Melhor taxa',
    needWallet: 'Você precisa de uma carteira para receber isto. Crie-a pelo menu da carteira e depois busque a rota de novo.',
    adding: 'Adicionando…',
    addTrustline: (code) => `Adicionar trustline de ${code}`,
    custody: { COSIGNED: 'coassinada', SELF_CUSTODY: 'autocustódia' },
  },
};
