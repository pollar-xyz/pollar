import type { PollarLanguage } from '@pollar/core';

export const WALLET_BUTTON_COPY: Record<
  PollarLanguage,
  {
    noWallet: string;
    signedIn: string;
    creatingWallet: string;
    createWallet: string;
    createCosigned: string;
    cosignedNote: string;
    createSelfCustody: string;
    selfCustodyNote: string;
    selfCustodyRisks: string;
    acceptRisks: string;
    back: string;
    activeSessions: string;
    logout: string;
    loginWithPollar: string;
    lockedNotice: string;
    lockedNoticeShort: string;
    creatingAccount: string;
    createAccount: string;
    send: string;
    receive: string;
    copied: string;
    copy: string;
    copyAddress: string;
    copyWalletAddress: string;
    openWallet: string;
    walletBalance: string;
    txHistory: string;
    buySell: string;
    identityVerification: string;
    distributionRules: string;
    setUpRecovery: string;
    walletRecovery: string;
    disconnect: string;
    disconnectWallet: string;
    provisioningDisabled: string;
    createWalletFailed: string;
    copyFailed: string;
    logoutFailed: string;
  }
> = {
  en: {
    noWallet: 'No wallet',
    signedIn: 'Signed in',
    creatingWallet: 'Creating wallet…',
    createWallet: 'Create wallet',
    createCosigned: 'Create co-signed wallet',
    cosignedNote: 'You and the app approve every signature together. Your wallet can be recovered with help.',
    createSelfCustody: 'Create self-custody wallet',
    selfCustodyNote: 'Only your device signs. Nobody else can move or recover your funds.',
    selfCustodyRisks:
      'In a self-custody wallet only your device can sign. If you lose this device and every recovery method, nobody can recover the wallet or its funds, not the app and not Pollar. Nobody can undo or freeze a transaction you sign.',
    acceptRisks: 'I understand and accept these risks',
    back: 'Back',
    activeSessions: 'Active sessions',
    logout: 'Log out',
    loginWithPollar: 'Login with Pollar',
    lockedNotice:
      'Locked: add a way to recover this wallet before sending or receiving. If you lose this device without one, the funds are lost.',
    lockedNoticeShort:
      'Your wallet is locked until you add a way to recover it. Without one, losing this device means losing the funds.',
    creatingAccount: 'Creating account…',
    createAccount: 'Create account',
    send: 'Send',
    receive: 'Receive',
    copied: 'Copied!',
    copy: 'Copy',
    copyAddress: 'Copy address',
    copyWalletAddress: 'Copy wallet address',
    openWallet: 'Open connected wallet',
    walletBalance: 'Wallet balance',
    txHistory: 'Transaction history',
    buySell: 'Buy / Sell',
    identityVerification: 'Identity verification',
    distributionRules: 'Distribution rules',
    setUpRecovery: 'Set up wallet recovery',
    walletRecovery: 'Wallet recovery',
    disconnect: 'Disconnect',
    disconnectWallet: 'Disconnect wallet',
    provisioningDisabled: 'This app does not create wallets.',
    createWalletFailed: 'Could not create the wallet. Try again.',
    copyFailed: 'Copy failed',
    logoutFailed: 'Logout failed',
  },
  es: {
    noWallet: 'Sin billetera',
    signedIn: 'Sesión iniciada',
    creatingWallet: 'Creando billetera…',
    createWallet: 'Crear billetera',
    createCosigned: 'Crear billetera cofirmada',
    cosignedNote: 'Tú y la app aprueban juntos cada firma. Tu billetera se puede recuperar con ayuda.',
    createSelfCustody: 'Crear billetera de autocustodia',
    selfCustodyNote: 'Solo tu dispositivo firma. Nadie más puede mover ni recuperar tus fondos.',
    selfCustodyRisks:
      'En una billetera de autocustodia solo tu dispositivo puede firmar. Si pierdes este dispositivo y todos tus métodos de recuperación, nadie podrá recuperar la billetera ni sus fondos: ni la app ni Pollar. Nadie puede deshacer ni congelar una transacción que firmes.',
    acceptRisks: 'Entiendo y acepto estos riesgos',
    back: 'Atrás',
    activeSessions: 'Sesiones activas',
    logout: 'Cerrar sesión',
    loginWithPollar: 'Entrar con Pollar',
    lockedNotice:
      'Bloqueada: agrega una forma de recuperar esta billetera antes de enviar o recibir. Si pierdes este dispositivo sin una, los fondos se pierden.',
    lockedNoticeShort:
      'Tu billetera está bloqueada hasta que agregues una forma de recuperarla. Sin una, perder este dispositivo significa perder los fondos.',
    creatingAccount: 'Creando cuenta…',
    createAccount: 'Crear cuenta',
    send: 'Enviar',
    receive: 'Recibir',
    copied: '¡Copiada!',
    copy: 'Copiar',
    copyAddress: 'Copiar dirección',
    copyWalletAddress: 'Copiar la dirección de la billetera',
    openWallet: 'Abrir la billetera conectada',
    walletBalance: 'Saldo de la billetera',
    txHistory: 'Historial de transacciones',
    buySell: 'Comprar / Vender',
    identityVerification: 'Verificación de identidad',
    distributionRules: 'Reglas de distribución',
    setUpRecovery: 'Configurar la recuperación',
    walletRecovery: 'Recuperación de la billetera',
    disconnect: 'Desconectar',
    disconnectWallet: 'Desconectar billetera',
    provisioningDisabled: 'Esta app no crea billeteras.',
    createWalletFailed: 'No se pudo crear la billetera. Intenta de nuevo.',
    copyFailed: 'No se pudo copiar',
    logoutFailed: 'No se pudo cerrar sesión',
  },
  pt: {
    noWallet: 'Sem carteira',
    signedIn: 'Conectado',
    creatingWallet: 'Criando carteira…',
    createWallet: 'Criar carteira',
    createCosigned: 'Criar carteira coassinada',
    cosignedNote: 'Você e o app aprovam juntos cada assinatura. Sua carteira pode ser recuperada com ajuda.',
    createSelfCustody: 'Criar carteira de autocustódia',
    selfCustodyNote: 'Só o seu dispositivo assina. Ninguém mais pode movimentar ou recuperar seus fundos.',
    selfCustodyRisks:
      'Em uma carteira de autocustódia só o seu dispositivo pode assinar. Se você perder este dispositivo e todos os métodos de recuperação, ninguém poderá recuperar a carteira nem seus fundos: nem o app nem a Pollar. Ninguém pode desfazer ou congelar uma transação que você assinar.',
    acceptRisks: 'Entendo e aceito esses riscos',
    back: 'Voltar',
    activeSessions: 'Sessões ativas',
    logout: 'Sair',
    loginWithPollar: 'Entrar com Pollar',
    lockedNotice:
      'Bloqueada: adicione uma forma de recuperar esta carteira antes de enviar ou receber. Se você perder este dispositivo sem uma, os fundos serão perdidos.',
    lockedNoticeShort:
      'Sua carteira está bloqueada até você adicionar uma forma de recuperá-la. Sem uma, perder este dispositivo significa perder os fundos.',
    creatingAccount: 'Criando conta…',
    createAccount: 'Criar conta',
    send: 'Enviar',
    receive: 'Receber',
    copied: 'Copiado!',
    copy: 'Copiar',
    copyAddress: 'Copiar endereço',
    copyWalletAddress: 'Copiar o endereço da carteira',
    openWallet: 'Abrir a carteira conectada',
    walletBalance: 'Saldo da carteira',
    txHistory: 'Histórico de transações',
    buySell: 'Comprar / Vender',
    identityVerification: 'Verificação de identidade',
    distributionRules: 'Regras de distribuição',
    setUpRecovery: 'Configurar a recuperação',
    walletRecovery: 'Recuperação da carteira',
    disconnect: 'Desconectar',
    disconnectWallet: 'Desconectar carteira',
    provisioningDisabled: 'Este app não cria carteiras.',
    createWalletFailed: 'Não foi possível criar a carteira. Tente novamente.',
    copyFailed: 'Não foi possível copiar',
    logoutFailed: 'Não foi possível sair',
  },
};
