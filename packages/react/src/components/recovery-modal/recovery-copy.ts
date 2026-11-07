import type { PollarLanguage } from '@pollar/core';

export const RECOVERY_COPY: Record<
  PollarLanguage,
  {
    title: string;
    close: string;
    working: string;
    codePlaceholder: string;
    loading: string;
    notRequired: string;
    notEnrolled: string;
    usePasskey: string;
    emailCodeTo: (address: string) => string;
    yourEmail: string;
    askAnotherDevice: string;
    selfCustodyWarning: string;
    acceptRisks: string;
    recoverEmailIntro: (address: string) => string;
    sendCode: string;
    recover: string;
    back: string;
    emailIntro: string;
    emailPlaceholder: string;
    email: string;
    confirm: string;
    phraseWarning: string;
    hide: string;
    exportIntro: string;
    exportAccept: string;
    showPhrase: string;
    locked: (withPasskey: boolean) => string;
    recoverable: string;
    passkeys: string;
    noPasskey: string;
    remove: string;
    addPasskey: string;
    passkeysUnavailableDevice: string;
    passkeysUnavailableApp: string;
    confirmed: string;
    confirmEmail: string;
    devices: string;
    thisDevice: string;
    aDevice: string;
    wantsToJoin: (label: string, key: string) => string;
    approve: string;
    reject: string;
    addDeviceHelp: string;
    recoveryPhrase: string;
    exportPhrase: string;
    passkeyAdded: string;
    emailConfirmed: string;
    deviceAdded: string;
    requestSent: string;
    recovered: string;
  }
> = {
  en: {
    title: 'Wallet recovery',
    close: 'Close',
    working: 'Working...',
    codePlaceholder: 'Code from the email',
    loading: "Loading your wallet's recovery methods...",
    notRequired: "This wallet doesn't need recovery methods: it isn't secured by your device.",
    notEnrolled:
      "This device isn't part of your wallet yet. Get back in with one of your recovery methods, or ask a device that already has the wallet to add this one.",
    usePasskey: 'Use a passkey',
    emailCodeTo: (address) => `Email a code to ${address}`,
    yourEmail: 'your email',
    askAnotherDevice: 'Ask another device to add this one',
    selfCustodyWarning:
      'This is a self-custody wallet: only your device can sign. If you lose this device and every recovery method, nobody can recover the wallet or its funds, not the app and not Pollar. Nobody can undo or freeze a transaction you sign.',
    acceptRisks: 'I understand and accept these risks',
    recoverEmailIntro: (address) =>
      `We'll email a code to ${address}. The code goes straight to the wallet provider, encrypted on this device.`,
    sendCode: 'Send code',
    recover: 'Recover',
    back: 'Back',
    emailIntro:
      'Confirm an email you control. If you lose this device, a code sent there lets you add a new one. Anyone who controls this inbox could do the same, so use one that is well protected.',
    emailPlaceholder: 'you@example.com',
    email: 'Email',
    confirm: 'Confirm',
    phraseWarning:
      'Anyone with these words controls every account in this wallet. Write them down offline and never share them.',
    hide: 'Hide',
    exportIntro:
      'Your recovery phrase lets you take this wallet to another app. It is decrypted only on this device; the app and Pollar never see it.',
    exportAccept: 'I understand that whoever sees the phrase controls the wallet',
    showPhrase: 'Show recovery phrase',
    locked: (withPasskey) =>
      `Your wallet is locked until you add a way to recover it. Without one, losing this device means losing the funds, and nobody can get them back, not the app and not Pollar. Add ${withPasskey ? 'a passkey, ' : ''}a second device or your email.`,
    recoverable: 'Your wallet can be recovered if you lose this device.',
    passkeys: 'Passkeys',
    noPasskey: 'No passkey yet.',
    remove: 'Remove',
    addPasskey: 'Add a passkey',
    passkeysUnavailableDevice: "Passkeys aren't available on this device.",
    passkeysUnavailableApp: "Passkeys aren't available in this app.",
    confirmed: 'Confirmed',
    confirmEmail: 'Confirm an email',
    devices: 'Devices',
    thisDevice: 'This device',
    aDevice: 'A device',
    wantsToJoin: (label, key) => `${label} wants to join (${key})`,
    approve: 'Approve',
    reject: 'Reject',
    addDeviceHelp:
      'To add another device, sign in there and choose "Ask another device to add this one"; it shows up here to approve. Only approve a device you are holding.',
    recoveryPhrase: 'Recovery phrase',
    exportPhrase: 'Export recovery phrase',
    passkeyAdded: 'Passkey added.',
    emailConfirmed: 'Email confirmed.',
    deviceAdded: 'Device added.',
    requestSent: 'Request sent. Approve it from a device that already has this wallet within 15 minutes.',
    recovered: 'This device is part of your wallet again.',
  },
  es: {
    title: 'Recuperación de la billetera',
    close: 'Cerrar',
    working: 'Procesando...',
    codePlaceholder: 'Código del correo',
    loading: 'Cargando los métodos de recuperación de tu billetera...',
    notRequired: 'Esta billetera no necesita métodos de recuperación: no está protegida por tu dispositivo.',
    notEnrolled:
      'Este dispositivo todavía no forma parte de tu billetera. Vuelve a entrar con uno de tus métodos de recuperación, o pide a un dispositivo que ya tenga la billetera que agregue este.',
    usePasskey: 'Usar una passkey',
    emailCodeTo: (address) => `Enviar un código a ${address}`,
    yourEmail: 'tu correo',
    askAnotherDevice: 'Pedir a otro dispositivo que agregue este',
    selfCustodyWarning:
      'Esta es una billetera de autocustodia: solo tu dispositivo puede firmar. Si pierdes este dispositivo y todos tus métodos de recuperación, nadie podrá recuperar la billetera ni sus fondos: ni la app ni Pollar. Nadie puede deshacer ni congelar una transacción que firmes.',
    acceptRisks: 'Entiendo y acepto estos riesgos',
    recoverEmailIntro: (address) =>
      `Te enviaremos un código a ${address}. El código va directo al proveedor de la billetera, cifrado en este dispositivo.`,
    sendCode: 'Enviar código',
    recover: 'Recuperar',
    back: 'Atrás',
    emailIntro:
      'Confirma un correo que controles. Si pierdes este dispositivo, un código enviado ahí te permite agregar uno nuevo. Cualquiera que controle esa bandeja de entrada podría hacer lo mismo, así que usa una que esté bien protegida.',
    emailPlaceholder: 'tu@ejemplo.com',
    email: 'Correo',
    confirm: 'Confirmar',
    phraseWarning:
      'Quien tenga estas palabras controla todas las cuentas de esta billetera. Anótalas sin conexión y nunca las compartas.',
    hide: 'Ocultar',
    exportIntro:
      'Tu frase de recuperación te permite llevar esta billetera a otra app. Solo se descifra en este dispositivo; ni la app ni Pollar la ven nunca.',
    exportAccept: 'Entiendo que quien vea la frase controla la billetera',
    showPhrase: 'Mostrar frase de recuperación',
    locked: (withPasskey) =>
      `Tu billetera está bloqueada hasta que agregues una forma de recuperarla. Sin una, perder este dispositivo significa perder los fondos, y nadie podrá recuperarlos: ni la app ni Pollar. Agrega ${withPasskey ? 'una passkey, ' : ''}un segundo dispositivo o tu correo.`,
    recoverable: 'Tu billetera se puede recuperar si pierdes este dispositivo.',
    passkeys: 'Passkeys',
    noPasskey: 'Todavía no hay passkeys.',
    remove: 'Quitar',
    addPasskey: 'Agregar una passkey',
    passkeysUnavailableDevice: 'Las passkeys no están disponibles en este dispositivo.',
    passkeysUnavailableApp: 'Las passkeys no están disponibles en esta app.',
    confirmed: 'Confirmado',
    confirmEmail: 'Confirmar un correo',
    devices: 'Dispositivos',
    thisDevice: 'Este dispositivo',
    aDevice: 'Un dispositivo',
    wantsToJoin: (label, key) => `${label} quiere unirse (${key})`,
    approve: 'Aprobar',
    reject: 'Rechazar',
    addDeviceHelp:
      'Para agregar otro dispositivo, inicia sesión en él y elige "Pedir a otro dispositivo que agregue este"; aparecerá aquí para que lo apruebes. Aprueba solo un dispositivo que tengas contigo.',
    recoveryPhrase: 'Frase de recuperación',
    exportPhrase: 'Exportar frase de recuperación',
    passkeyAdded: 'Passkey agregada.',
    emailConfirmed: 'Correo confirmado.',
    deviceAdded: 'Dispositivo agregado.',
    requestSent: 'Solicitud enviada. Apruébala desde un dispositivo que ya tenga esta billetera en los próximos 15 minutos.',
    recovered: 'Este dispositivo vuelve a formar parte de tu billetera.',
  },
  pt: {
    title: 'Recuperação da carteira',
    close: 'Fechar',
    working: 'Processando...',
    codePlaceholder: 'Código do e-mail',
    loading: 'Carregando os métodos de recuperação da sua carteira...',
    notRequired: 'Esta carteira não precisa de métodos de recuperação: ela não é protegida pelo seu dispositivo.',
    notEnrolled:
      'Este dispositivo ainda não faz parte da sua carteira. Entre de novo com um dos seus métodos de recuperação ou peça a um dispositivo que já tenha a carteira para adicionar este.',
    usePasskey: 'Usar uma passkey',
    emailCodeTo: (address) => `Enviar um código para ${address}`,
    yourEmail: 'seu e-mail',
    askAnotherDevice: 'Pedir a outro dispositivo para adicionar este',
    selfCustodyWarning:
      'Esta é uma carteira de autocustódia: só o seu dispositivo pode assinar. Se você perder este dispositivo e todos os métodos de recuperação, ninguém poderá recuperar a carteira nem seus fundos: nem o app nem a Pollar. Ninguém pode desfazer ou congelar uma transação que você assinar.',
    acceptRisks: 'Entendo e aceito esses riscos',
    recoverEmailIntro: (address) =>
      `Vamos enviar um código para ${address}. O código vai direto para o provedor da carteira, criptografado neste dispositivo.`,
    sendCode: 'Enviar código',
    recover: 'Recuperar',
    back: 'Voltar',
    emailIntro:
      'Confirme um e-mail que você controla. Se você perder este dispositivo, um código enviado para ele permite adicionar um novo. Qualquer pessoa que controle essa caixa de entrada poderia fazer o mesmo, então use uma que esteja bem protegida.',
    emailPlaceholder: 'seu@exemplo.com',
    email: 'E-mail',
    confirm: 'Confirmar',
    phraseWarning:
      'Quem tiver estas palavras controla todas as contas desta carteira. Anote-as offline e nunca as compartilhe.',
    hide: 'Ocultar',
    exportIntro:
      'Sua frase de recuperação permite levar esta carteira para outro app. Ela só é descriptografada neste dispositivo; nem o app nem a Pollar a veem.',
    exportAccept: 'Entendo que quem vir a frase controla a carteira',
    showPhrase: 'Mostrar frase de recuperação',
    locked: (withPasskey) =>
      `Sua carteira está bloqueada até você adicionar uma forma de recuperá-la. Sem uma, perder este dispositivo significa perder os fundos, e ninguém poderá recuperá-los: nem o app nem a Pollar. Adicione ${withPasskey ? 'uma passkey, ' : ''}um segundo dispositivo ou seu e-mail.`,
    recoverable: 'Sua carteira pode ser recuperada se você perder este dispositivo.',
    passkeys: 'Passkeys',
    noPasskey: 'Ainda não há passkeys.',
    remove: 'Remover',
    addPasskey: 'Adicionar uma passkey',
    passkeysUnavailableDevice: 'Passkeys não estão disponíveis neste dispositivo.',
    passkeysUnavailableApp: 'Passkeys não estão disponíveis neste app.',
    confirmed: 'Confirmado',
    confirmEmail: 'Confirmar um e-mail',
    devices: 'Dispositivos',
    thisDevice: 'Este dispositivo',
    aDevice: 'Um dispositivo',
    wantsToJoin: (label, key) => `${label} quer entrar (${key})`,
    approve: 'Aprovar',
    reject: 'Recusar',
    addDeviceHelp:
      'Para adicionar outro dispositivo, entre nele e escolha "Pedir a outro dispositivo para adicionar este"; ele aparece aqui para você aprovar. Só aprove um dispositivo que esteja com você.',
    recoveryPhrase: 'Frase de recuperação',
    exportPhrase: 'Exportar frase de recuperação',
    passkeyAdded: 'Passkey adicionada.',
    emailConfirmed: 'E-mail confirmado.',
    deviceAdded: 'Dispositivo adicionado.',
    requestSent: 'Solicitação enviada. Aprove-a em um dispositivo que já tenha esta carteira nos próximos 15 minutos.',
    recovered: 'Este dispositivo voltou a fazer parte da sua carteira.',
  },
};
