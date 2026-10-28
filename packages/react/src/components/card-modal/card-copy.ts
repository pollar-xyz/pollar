import type { CardIncomeRange, PollarLanguage } from '@pollar/core';

export interface CardCopy {
  /** What each funding state means to the user: a title, and for one in flight what it waits on. */
  funding: Record<string, { title: string; hint?: string }>;
  incomeRanges: Record<CardIncomeRange, string>;
  txLabels: Record<string, string>;
  kycPending: Record<string, string>;
  kycFinal: Record<string, string>;
  /** Errors whose cause the user can act on, said plainly instead of the provider's raw message. */
  errors: Record<string, string>;
  blocked: { registryReview: string; kycReview: string; kycRejected: string };
  failed: {
    load: string;
    start: string;
    submit: string;
    issue: string;
    refresh: string;
    reveal: string;
    loadFundings: string;
    fund: string;
    loadDeposit: string;
    openPage: string;
  };
  notSigned: string;
  title: { addFunds: string; yourCard: string; getCard: string };
  back: string;
  refresh: string;
  close: string;
  unavailableForApp: string;
  unavailableNow: string;
  defaultCardName: (provider: string) => string;
  intro: (card: string, signedIn: boolean) => string;
  stepsDone: (completed: number, total: number) => string;
  starting: string;
  continue: string;
  start: string;
  aboutYou: string;
  firstName: string;
  lastName: string;
  birthDate: string;
  datePlaceholder: string;
  nationalId: string;
  idCountry: string;
  occupation: string;
  selectOccupation: string;
  phoneCountryCode: string;
  phoneNumber: string;
  annualIncome: string;
  monthlySpend: string;
  accountPurpose: string;
  address: string;
  line1: string;
  line2: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
  termsPrefix: string;
  termsLink: (provider: string) => string;
  termsPending: string;
  readTerms: string;
  sending: string;
  verifyIdentity: string;
  done: string;
  autoUpdate: string;
  verified: string;
  cardName: string;
  cardNamePlaceholder: string;
  issuing: string;
  issueCard: string;
  copyCardNumber: string;
  copyExpiry: string;
  copyCvc: string;
  copyAddress: string;
  copy: string;
  copied: string;
  expires: string;
  expShort: string;
  available: string;
  limit: string;
  toPay: string;
  hideDetails: string;
  loading: string;
  showDetails: string;
  addFunds: string;
  detailsHide: string;
  recentActivity: string;
  noMovements: string;
  fundIntro: (assets: string) => string;
  or: string;
  amount: string;
  fundFromWallet: string;
  yourFundings: string;
  stepOf: (step: number, total: number) => string;
  canClose: string;
  preferOtherWallet: string;
  showDeposit: string;
  chain: (id: string | number) => string;
  sendOnly: (tokens: string, network: string) => string;
  noDeposit: string;
  hideDeposit: string;
}

export const CARD_COPY: Record<PollarLanguage, CardCopy> = {
  en: {
    funding: {
      CREATED: {
        title: 'Confirming your payment',
        hint: 'Your USDC payment is being confirmed on Stellar. This takes a few seconds.',
      },
      BURNED: {
        title: 'Sending it to the card network',
        hint: 'Your USDC left Stellar. Circle is confirming the transfer, usually in about a minute.',
      },
      ATTESTED: {
        title: 'Crossing to the card network',
        hint: 'Transfer confirmed. Delivering the USDC to the card network.',
      },
      MINTED: {
        title: 'Arrived, crediting your card',
        hint: 'The USDC reached the card provider, which is adding it to your card. This can take a few minutes.',
      },
      CREDITED: { title: 'Credited to your card' },
      FAILED: { title: 'Failed' },
    },
    incomeRanges: {
      '0-1000': 'Up to 1,000 USD',
      '1000-5000': '1,000 to 5,000 USD',
      '5000-10000': '5,000 to 10,000 USD',
      '10000+': 'More than 10,000 USD',
    },
    txLabels: {
      deposit: 'Deposit',
      transactionTransfer: 'Bank deposit',
      spend: 'Purchase',
      spend_adjustment: 'Adjustment',
      fee: 'Fee',
      fee_refund: 'Fee refund',
      withdrawal: 'Withdrawal',
      card_insurance: 'Card issuance',
    },
    kycPending: {
      PENDING: 'Your information is being reviewed.',
      NEEDS_ACTION:
        'Finish verifying your identity with the card provider: you will be asked for a photo of your document and a selfie.',
      IN_REVIEW: 'Your verification is under manual review. This can take a while.',
    },
    kycFinal: {
      DENIED: 'Your verification was denied.',
      LOCKED: 'Your account is locked.',
      CANCELED: 'Your verification was canceled.',
    },
    errors: {
      SDK_CARDS_PROVIDER_ERROR: 'The card provider is not responding right now. Please try again in a few minutes.',
      SDK_CARDS_IP_NOT_SUPPORTED:
        'The card provider cannot accept your current connection (IPv6). Please try again from another network, for example Wi-Fi.',
      SDK_CARDS_PROVIDER_USER_TAKEN:
        'This email is already registered with the card provider through another app. Use a different email to get a card here.',
    },
    blocked: {
      registryReview: 'Your details are under review.',
      kycReview: 'Your verification is under review.',
      kycRejected: 'Your verification was not approved.',
    },
    failed: {
      load: 'Could not load your card',
      start: 'Could not start your card application',
      submit: 'Could not submit your information',
      issue: 'Could not issue your card',
      refresh: 'Could not refresh your card',
      reveal: 'Could not show the card details',
      loadFundings: 'Could not load your fundings',
      fund: 'Could not fund the card',
      loadDeposit: 'Could not load the deposit address',
      openPage: 'Could not open the page. Please try again.',
    },
    notSigned: 'The payment was not signed.',
    title: { addFunds: 'Add funds', yourCard: 'Your card', getCard: 'Get a card' },
    back: 'Back',
    refresh: 'Refresh',
    close: 'Close',
    unavailableForApp: 'Cards are not available for this app.',
    unavailableNow: 'Cards are not available right now.',
    defaultCardName: (provider) => `a ${provider} card`,
    intro: (card, signedIn) =>
      `Get ${card} funded from your wallet${signedIn ? '' : ' once you sign in'}. You will verify your identity first; it takes a few minutes.`,
    stepsDone: (completed, total) => `${completed} of ${total} steps done`,
    starting: 'Starting...',
    continue: 'Continue',
    start: 'Start',
    aboutYou: 'About you',
    firstName: 'First name',
    lastName: 'Last name',
    birthDate: 'Birth date',
    datePlaceholder: 'YYYY-MM-DD',
    nationalId: 'ID number',
    idCountry: 'ID country (2 letters)',
    occupation: 'Occupation',
    selectOccupation: 'Select...',
    phoneCountryCode: 'Phone country code',
    phoneNumber: 'Phone number',
    annualIncome: 'Annual income',
    monthlySpend: 'Expected monthly spend',
    accountPurpose: 'What will you use the card for?',
    address: 'Address',
    line1: 'Street and number',
    line2: 'Apartment, floor (optional)',
    city: 'City',
    region: 'State or province',
    postalCode: 'Postal code',
    country: 'Country (2 letters)',
    termsPrefix: 'I have read and accept the ',
    termsLink: (provider) => `${provider} terms of service`,
    termsPending: ' (demo: the final terms link is pending)',
    readTerms: 'Read the terms',
    sending: 'Sending...',
    verifyIdentity: 'Verify my identity',
    done: 'I am done',
    autoUpdate: 'This screen updates on its own once the verification comes back.',
    verified: 'Your identity is verified. Issue your virtual card to start.',
    cardName: 'Card name (optional)',
    cardNamePlaceholder: 'Everyday card',
    issuing: 'Issuing...',
    issueCard: 'Issue my card',
    copyCardNumber: 'Copy card number',
    copyExpiry: 'Copy expiry date',
    copyCvc: 'Copy CVC',
    copyAddress: 'Copy address',
    copy: 'Copy',
    copied: 'Copied',
    expires: 'Expires',
    expShort: 'EXP',
    available: 'Available',
    limit: 'Limit',
    toPay: 'To pay',
    hideDetails: 'Hide details',
    loading: 'Loading...',
    showDetails: 'Show details',
    addFunds: 'Add funds',
    detailsHide: 'The details hide on their own in 30 seconds. Do not share them.',
    recentActivity: 'Recent activity',
    noMovements: 'No movements yet.',
    fundIntro: (assets) => `Move ${assets} from your wallet to your card. It takes a few minutes to cross to the card network.`,
    or: 'or',
    amount: 'Amount',
    fundFromWallet: 'Fund from my wallet',
    yourFundings: 'Your fundings',
    stepOf: (step, total) => `Step ${step} of ${total}`,
    canClose: 'You can close this window: the funding keeps going and your card is credited when it finishes.',
    preferOtherWallet: 'Prefer to send from another wallet?',
    showDeposit: 'Show the deposit address',
    chain: (id) => `chain ${id}`,
    sendOnly: (tokens, network) => `Send only ${tokens} on ${network}; anything else can be lost.`,
    noDeposit: 'The provider returned no deposit address.',
    hideDeposit: 'Hide the deposit address',
  },
  es: {
    funding: {
      CREATED: {
        title: 'Confirmando tu pago',
        hint: 'Tu pago en USDC se está confirmando en Stellar. Esto toma unos segundos.',
      },
      BURNED: {
        title: 'Enviándolo a la red de la tarjeta',
        hint: 'Tus USDC salieron de Stellar. Circle está confirmando la transferencia, normalmente en un minuto.',
      },
      ATTESTED: {
        title: 'Cruzando a la red de la tarjeta',
        hint: 'Transferencia confirmada. Entregando los USDC a la red de la tarjeta.',
      },
      MINTED: {
        title: 'Llegó, acreditando tu tarjeta',
        hint: 'Los USDC llegaron al proveedor de la tarjeta, que los está sumando a tu tarjeta. Esto puede tardar unos minutos.',
      },
      CREDITED: { title: 'Acreditado en tu tarjeta' },
      FAILED: { title: 'Falló' },
    },
    incomeRanges: {
      '0-1000': 'Hasta 1,000 USD',
      '1000-5000': 'De 1,000 a 5,000 USD',
      '5000-10000': 'De 5,000 a 10,000 USD',
      '10000+': 'Más de 10,000 USD',
    },
    txLabels: {
      deposit: 'Depósito',
      transactionTransfer: 'Depósito bancario',
      spend: 'Compra',
      spend_adjustment: 'Ajuste',
      fee: 'Comisión',
      fee_refund: 'Reembolso de comisión',
      withdrawal: 'Retiro',
      card_insurance: 'Emisión de tarjeta',
    },
    kycPending: {
      PENDING: 'Estamos revisando tu información.',
      NEEDS_ACTION:
        'Termina de verificar tu identidad con el proveedor de la tarjeta: te pedirá una foto de tu documento y una selfie.',
      IN_REVIEW: 'Tu verificación está en revisión manual. Esto puede tardar un rato.',
    },
    kycFinal: {
      DENIED: 'Tu verificación fue rechazada.',
      LOCKED: 'Tu cuenta está bloqueada.',
      CANCELED: 'Tu verificación fue cancelada.',
    },
    errors: {
      SDK_CARDS_PROVIDER_ERROR: 'El proveedor de la tarjeta no responde en este momento. Intenta de nuevo en unos minutos.',
      SDK_CARDS_IP_NOT_SUPPORTED:
        'El proveedor de la tarjeta no acepta tu conexión actual (IPv6). Intenta de nuevo desde otra red, por ejemplo Wi-Fi.',
      SDK_CARDS_PROVIDER_USER_TAKEN:
        'Este correo ya está registrado con el proveedor de la tarjeta a través de otra app. Usa otro correo para obtener una tarjeta aquí.',
    },
    blocked: {
      registryReview: 'Tus datos están en revisión.',
      kycReview: 'Tu verificación está en revisión.',
      kycRejected: 'Tu verificación no fue aprobada.',
    },
    failed: {
      load: 'No se pudo cargar tu tarjeta',
      start: 'No se pudo iniciar tu solicitud de tarjeta',
      submit: 'No se pudo enviar tu información',
      issue: 'No se pudo emitir tu tarjeta',
      refresh: 'No se pudo actualizar tu tarjeta',
      reveal: 'No se pudieron mostrar los datos de la tarjeta',
      loadFundings: 'No se pudieron cargar tus recargas',
      fund: 'No se pudo recargar la tarjeta',
      loadDeposit: 'No se pudo cargar la dirección de depósito',
      openPage: 'No se pudo abrir la página. Intenta de nuevo.',
    },
    notSigned: 'El pago no fue firmado.',
    title: { addFunds: 'Agregar fondos', yourCard: 'Tu tarjeta', getCard: 'Obtén una tarjeta' },
    back: 'Volver',
    refresh: 'Actualizar',
    close: 'Cerrar',
    unavailableForApp: 'Las tarjetas no están disponibles para esta app.',
    unavailableNow: 'Las tarjetas no están disponibles en este momento.',
    defaultCardName: (provider) => `una tarjeta ${provider}`,
    intro: (card, signedIn) =>
      `Obtén ${card} con fondos de tu billetera${signedIn ? '' : ' cuando inicies sesión'}. Primero verificarás tu identidad; toma unos minutos.`,
    stepsDone: (completed, total) => `${completed} de ${total} pasos completados`,
    starting: 'Iniciando...',
    continue: 'Continuar',
    start: 'Comenzar',
    aboutYou: 'Sobre ti',
    firstName: 'Nombre',
    lastName: 'Apellido',
    birthDate: 'Fecha de nacimiento',
    datePlaceholder: 'AAAA-MM-DD',
    nationalId: 'Número de documento',
    idCountry: 'País del documento (2 letras)',
    occupation: 'Ocupación',
    selectOccupation: 'Selecciona...',
    phoneCountryCode: 'Código de país del teléfono',
    phoneNumber: 'Número de teléfono',
    annualIncome: 'Ingreso anual',
    monthlySpend: 'Gasto mensual esperado',
    accountPurpose: '¿Para qué usarás la tarjeta?',
    address: 'Dirección',
    line1: 'Calle y número',
    line2: 'Departamento, piso (opcional)',
    city: 'Ciudad',
    region: 'Estado o provincia',
    postalCode: 'Código postal',
    country: 'País (2 letras)',
    termsPrefix: 'Leí y acepto los ',
    termsLink: (provider) => `términos de servicio de ${provider}`,
    termsPending: ' (demo: el enlace final a los términos está pendiente)',
    readTerms: 'Leer los términos',
    sending: 'Enviando...',
    verifyIdentity: 'Verificar mi identidad',
    done: 'Ya terminé',
    autoUpdate: 'Esta pantalla se actualiza sola cuando llegue el resultado de la verificación.',
    verified: 'Tu identidad está verificada. Emite tu tarjeta virtual para empezar.',
    cardName: 'Nombre de la tarjeta (opcional)',
    cardNamePlaceholder: 'Tarjeta del día a día',
    issuing: 'Emitiendo...',
    issueCard: 'Emitir mi tarjeta',
    copyCardNumber: 'Copiar número de tarjeta',
    copyExpiry: 'Copiar fecha de vencimiento',
    copyCvc: 'Copiar CVC',
    copyAddress: 'Copiar dirección',
    copy: 'Copiar',
    copied: 'Copiado',
    expires: 'Vence',
    expShort: 'VENCE',
    available: 'Disponible',
    limit: 'Límite',
    toPay: 'A pagar',
    hideDetails: 'Ocultar datos',
    loading: 'Cargando...',
    showDetails: 'Mostrar datos',
    addFunds: 'Agregar fondos',
    detailsHide: 'Los datos se ocultan solos en 30 segundos. No los compartas.',
    recentActivity: 'Actividad reciente',
    noMovements: 'Todavía no hay movimientos.',
    fundIntro: (assets) => `Mueve ${assets} de tu billetera a tu tarjeta. Tarda unos minutos en llegar a la red de la tarjeta.`,
    or: 'o',
    amount: 'Monto',
    fundFromWallet: 'Recargar desde mi billetera',
    yourFundings: 'Tus recargas',
    stepOf: (step, total) => `Paso ${step} de ${total}`,
    canClose: 'Puedes cerrar esta ventana: la recarga sigue en curso y tu tarjeta se acredita cuando termine.',
    preferOtherWallet: '¿Prefieres enviar desde otra billetera?',
    showDeposit: 'Mostrar la dirección de depósito',
    chain: (id) => `cadena ${id}`,
    sendOnly: (tokens, network) => `Envía solo ${tokens} en ${network}; cualquier otra cosa puede perderse.`,
    noDeposit: 'El proveedor no devolvió ninguna dirección de depósito.',
    hideDeposit: 'Ocultar la dirección de depósito',
  },
  pt: {
    funding: {
      CREATED: {
        title: 'Confirmando seu pagamento',
        hint: 'Seu pagamento em USDC está sendo confirmado na Stellar. Isso leva alguns segundos.',
      },
      BURNED: {
        title: 'Enviando para a rede do cartão',
        hint: 'Seus USDC saíram da Stellar. A Circle está confirmando a transferência, normalmente em cerca de um minuto.',
      },
      ATTESTED: {
        title: 'Atravessando para a rede do cartão',
        hint: 'Transferência confirmada. Entregando os USDC à rede do cartão.',
      },
      MINTED: {
        title: 'Chegou, creditando seu cartão',
        hint: 'Os USDC chegaram ao provedor do cartão, que está adicionando ao seu cartão. Isso pode levar alguns minutos.',
      },
      CREDITED: { title: 'Creditado no seu cartão' },
      FAILED: { title: 'Falhou' },
    },
    incomeRanges: {
      '0-1000': 'Até 1.000 USD',
      '1000-5000': 'De 1.000 a 5.000 USD',
      '5000-10000': 'De 5.000 a 10.000 USD',
      '10000+': 'Mais de 10.000 USD',
    },
    txLabels: {
      deposit: 'Depósito',
      transactionTransfer: 'Depósito bancário',
      spend: 'Compra',
      spend_adjustment: 'Ajuste',
      fee: 'Taxa',
      fee_refund: 'Reembolso de taxa',
      withdrawal: 'Saque',
      card_insurance: 'Emissão do cartão',
    },
    kycPending: {
      PENDING: 'Suas informações estão em análise.',
      NEEDS_ACTION:
        'Conclua a verificação da sua identidade com o provedor do cartão: será pedida uma foto do seu documento e uma selfie.',
      IN_REVIEW: 'Sua verificação está em análise manual. Isso pode demorar um pouco.',
    },
    kycFinal: {
      DENIED: 'Sua verificação foi negada.',
      LOCKED: 'Sua conta está bloqueada.',
      CANCELED: 'Sua verificação foi cancelada.',
    },
    errors: {
      SDK_CARDS_PROVIDER_ERROR: 'O provedor do cartão não está respondendo agora. Tente de novo em alguns minutos.',
      SDK_CARDS_IP_NOT_SUPPORTED:
        'O provedor do cartão não aceita sua conexão atual (IPv6). Tente de novo a partir de outra rede, por exemplo Wi-Fi.',
      SDK_CARDS_PROVIDER_USER_TAKEN:
        'Este e-mail já está cadastrado no provedor do cartão por meio de outro app. Use outro e-mail para obter um cartão aqui.',
    },
    blocked: {
      registryReview: 'Seus dados estão em análise.',
      kycReview: 'Sua verificação está em análise.',
      kycRejected: 'Sua verificação não foi aprovada.',
    },
    failed: {
      load: 'Não foi possível carregar seu cartão',
      start: 'Não foi possível iniciar sua solicitação de cartão',
      submit: 'Não foi possível enviar suas informações',
      issue: 'Não foi possível emitir seu cartão',
      refresh: 'Não foi possível atualizar seu cartão',
      reveal: 'Não foi possível mostrar os dados do cartão',
      loadFundings: 'Não foi possível carregar suas recargas',
      fund: 'Não foi possível recarregar o cartão',
      loadDeposit: 'Não foi possível carregar o endereço de depósito',
      openPage: 'Não foi possível abrir a página. Tente de novo.',
    },
    notSigned: 'O pagamento não foi assinado.',
    title: { addFunds: 'Adicionar fundos', yourCard: 'Seu cartão', getCard: 'Obtenha um cartão' },
    back: 'Voltar',
    refresh: 'Atualizar',
    close: 'Fechar',
    unavailableForApp: 'Cartões não estão disponíveis para este app.',
    unavailableNow: 'Cartões não estão disponíveis no momento.',
    defaultCardName: (provider) => `um cartão ${provider}`,
    intro: (card, signedIn) =>
      `Obtenha ${card} com fundos da sua carteira${signedIn ? '' : ' assim que você entrar'}. Primeiro você vai verificar sua identidade; leva alguns minutos.`,
    stepsDone: (completed, total) => `${completed} de ${total} etapas concluídas`,
    starting: 'Iniciando...',
    continue: 'Continuar',
    start: 'Começar',
    aboutYou: 'Sobre você',
    firstName: 'Nome',
    lastName: 'Sobrenome',
    birthDate: 'Data de nascimento',
    datePlaceholder: 'AAAA-MM-DD',
    nationalId: 'Número do documento',
    idCountry: 'País do documento (2 letras)',
    occupation: 'Ocupação',
    selectOccupation: 'Selecione...',
    phoneCountryCode: 'Código do país do telefone',
    phoneNumber: 'Número de telefone',
    annualIncome: 'Renda anual',
    monthlySpend: 'Gasto mensal previsto',
    accountPurpose: 'Para que você vai usar o cartão?',
    address: 'Endereço',
    line1: 'Rua e número',
    line2: 'Apartamento, andar (opcional)',
    city: 'Cidade',
    region: 'Estado ou província',
    postalCode: 'CEP',
    country: 'País (2 letras)',
    termsPrefix: 'Li e aceito os ',
    termsLink: (provider) => `termos de serviço da ${provider}`,
    termsPending: ' (demo: o link final dos termos está pendente)',
    readTerms: 'Ler os termos',
    sending: 'Enviando...',
    verifyIdentity: 'Verificar minha identidade',
    done: 'Já terminei',
    autoUpdate: 'Esta tela se atualiza sozinha quando o resultado da verificação chegar.',
    verified: 'Sua identidade está verificada. Emita seu cartão virtual para começar.',
    cardName: 'Nome do cartão (opcional)',
    cardNamePlaceholder: 'Cartão do dia a dia',
    issuing: 'Emitindo...',
    issueCard: 'Emitir meu cartão',
    copyCardNumber: 'Copiar número do cartão',
    copyExpiry: 'Copiar data de validade',
    copyCvc: 'Copiar CVC',
    copyAddress: 'Copiar endereço',
    copy: 'Copiar',
    copied: 'Copiado',
    expires: 'Validade',
    expShort: 'VAL',
    available: 'Disponível',
    limit: 'Limite',
    toPay: 'A pagar',
    hideDetails: 'Ocultar dados',
    loading: 'Carregando...',
    showDetails: 'Mostrar dados',
    addFunds: 'Adicionar fundos',
    detailsHide: 'Os dados se ocultam sozinhos em 30 segundos. Não os compartilhe.',
    recentActivity: 'Atividade recente',
    noMovements: 'Ainda não há movimentações.',
    fundIntro: (assets) =>
      `Mova ${assets} da sua carteira para o seu cartão. Leva alguns minutos para chegar à rede do cartão.`,
    or: 'ou',
    amount: 'Valor',
    fundFromWallet: 'Recarregar da minha carteira',
    yourFundings: 'Suas recargas',
    stepOf: (step, total) => `Etapa ${step} de ${total}`,
    canClose: 'Você pode fechar esta janela: a recarga continua e seu cartão é creditado quando terminar.',
    preferOtherWallet: 'Prefere enviar de outra carteira?',
    showDeposit: 'Mostrar o endereço de depósito',
    chain: (id) => `rede ${id}`,
    sendOnly: (tokens, network) => `Envie apenas ${tokens} na ${network}; qualquer outra coisa pode ser perdida.`,
    noDeposit: 'O provedor não retornou nenhum endereço de depósito.',
    hideDeposit: 'Ocultar o endereço de depósito',
  },
};
