import type { KycStatus, PollarLanguage } from '@pollar/core';

export interface KycCopy {
  /** What a failed KYC call means for the user, by backend code. */
  errors: Record<string, string>;
  loadFailed: string;
  startFailed: string;
  duplicateDocument: string;
  stillReviewing: string;
  processing: string;
  status: Record<KycStatus, string>;
  title: string;
  subtitle: {
    select: string;
    verifying: (provider: string) => string;
    polling: string;
    ready: string;
    status: string;
  };
  theProvider: string;
  refresh: string;
  refreshProviders: string;
  close: string;
  opening: (provider: string) => string;
  verification: string;
  loadingProviders: string;
  noProviders: string;
  openingShort: string;
  continueNewTab: string;
  continueHere: string;
  continueBrowser: string;
  inProgress: string;
  openNewTab: string;
  separateTab: string;
  openVerification: string;
  iframeTitle: string;
  formHere: string;
  opensHere: string;
  opensInBrowser: string;
  finished: string;
  checkStatus: string;
  checking: string;
  approved: string;
  result: { approved: string; rejected: string; expired: string };
  startAgain: string;
  checkAgain: string;
  notConfirmed: string;
  openPageFailed: string;
  noSession: string;
}

export const KYC_COPY: Record<PollarLanguage, KycCopy> = {
  en: {
    errors: {
      SDK_KYC_NOT_CONFIGURED: 'Identity verification is not available for this app yet.',
      SDK_KYC_PROVIDER_ERROR: 'The verification service is not responding right now. Please try again in a moment.',
      SDK_KYC_SESSION_EXPIRED: 'Your previous verification session expired. Select the provider to start a new one.',
      SDK_KYC_PROVIDER_NOT_FOUND: 'This verification option is no longer available. Refresh to see the current options.',
      SDK_KYC_PROVIDER_NOT_ENABLED: 'This verification option is no longer available. Refresh to see the current options.',
      SDK_RAMPS_PROVIDER_NOT_CONFIGURED: 'This route is not set up for identity verification yet.',
      VALIDATION_ERROR: 'This verification option is not available for your country.',
    },
    loadFailed: 'Could not load verification options. Please refresh to try again.',
    startFailed: 'Could not start verification. Please try again.',
    duplicateDocument:
      'This document is already linked to another account, so our team is reviewing it. You can check again later.',
    stillReviewing: 'Your verification is still being reviewed. You can check again shortly.',
    processing: 'Your verification was approved. We are finishing setting it up; check again in a minute.',
    status: {
      none: 'Not started',
      pending: 'Pending review',
      approved: 'Verified',
      rejected: 'Rejected',
      expired: 'Expired',
    },
    title: 'Identity verification',
    subtitle: {
      select: 'Choose your verification provider',
      verifying: (provider) => `Complete the steps with ${provider}`,
      polling: 'Waiting for verification result',
      ready: 'You’re ready to continue',
      status: 'Your verification status',
    },
    theProvider: 'the provider',
    refresh: 'Refresh',
    refreshProviders: 'Refresh providers',
    close: 'Close',
    opening: (provider) => `Opening ${provider}…`,
    verification: 'verification',
    loadingProviders: 'Loading providers…',
    noProviders: 'No providers available for your country.',
    openingShort: 'Opening…',
    continueNewTab: 'Continue in a new tab',
    continueHere: 'Continue here',
    continueBrowser: 'Continue in the browser',
    inProgress: 'Verification in progress',
    openNewTab: 'Open in new tab ↗',
    separateTab: 'Complete verification in a separate tab, then return here to check your status.',
    openVerification: 'Open verification',
    iframeTitle: 'KYC verification',
    formHere: 'The identity verification form will appear here.',
    opensHere: 'Identity verification will open here.',
    opensInBrowser: 'Verification opens in your browser. Finish the steps there, then come back here to check your status.',
    finished: 'Finished the steps? Check your status to continue.',
    checkStatus: 'Check status',
    checking: 'Checking verification status…',
    approved: 'Approved',
    result: {
      approved: 'Your identity has been verified successfully.',
      rejected: 'Your verification was not approved. Contact support for the next steps.',
      expired: 'Your verification expired. Start again to verify your identity.',
    },
    startAgain: 'Start again',
    checkAgain: 'Check again',
    notConfirmed:
      'We could not confirm your result yet. Check again shortly; this does not mean your verification was rejected.',
    openPageFailed: 'Could not open the verification page. Please try again.',
    noSession: 'The KYC provider answered without a session.',
  },
  es: {
    errors: {
      SDK_KYC_NOT_CONFIGURED: 'La verificación de identidad todavía no está disponible para esta app.',
      SDK_KYC_PROVIDER_ERROR: 'El servicio de verificación no responde en este momento. Intenta de nuevo en un momento.',
      SDK_KYC_SESSION_EXPIRED: 'Tu sesión de verificación anterior venció. Elige el proveedor para iniciar una nueva.',
      SDK_KYC_PROVIDER_NOT_FOUND:
        'Esta opción de verificación ya no está disponible. Actualiza para ver las opciones actuales.',
      SDK_KYC_PROVIDER_NOT_ENABLED:
        'Esta opción de verificación ya no está disponible. Actualiza para ver las opciones actuales.',
      SDK_RAMPS_PROVIDER_NOT_CONFIGURED: 'Esta ruta todavía no está configurada para la verificación de identidad.',
      VALIDATION_ERROR: 'Esta opción de verificación no está disponible para tu país.',
    },
    loadFailed: 'No se pudieron cargar las opciones de verificación. Actualiza para intentar de nuevo.',
    startFailed: 'No se pudo iniciar la verificación. Intenta de nuevo.',
    duplicateDocument:
      'Este documento ya está vinculado a otra cuenta, así que nuestro equipo lo está revisando. Puedes volver a consultar más tarde.',
    stillReviewing: 'Tu verificación sigue en revisión. Puedes volver a consultar en un rato.',
    processing: 'Tu verificación fue aprobada. Estamos terminando de configurarla; vuelve a consultar en un minuto.',
    status: {
      none: 'Sin iniciar',
      pending: 'En revisión',
      approved: 'Verificado',
      rejected: 'Rechazado',
      expired: 'Vencido',
    },
    title: 'Verificación de identidad',
    subtitle: {
      select: 'Elige tu proveedor de verificación',
      verifying: (provider) => `Completa los pasos con ${provider}`,
      polling: 'Esperando el resultado de la verificación',
      ready: 'Ya puedes continuar',
      status: 'El estado de tu verificación',
    },
    theProvider: 'el proveedor',
    refresh: 'Actualizar',
    refreshProviders: 'Actualizar proveedores',
    close: 'Cerrar',
    opening: (provider) => `Abriendo ${provider}…`,
    verification: 'la verificación',
    loadingProviders: 'Cargando proveedores…',
    noProviders: 'No hay proveedores disponibles para tu país.',
    openingShort: 'Abriendo…',
    continueNewTab: 'Continuar en una pestaña nueva',
    continueHere: 'Continuar aquí',
    continueBrowser: 'Continuar en el navegador',
    inProgress: 'Verificación en curso',
    openNewTab: 'Abrir en una pestaña nueva ↗',
    separateTab: 'Completa la verificación en otra pestaña y luego vuelve aquí para consultar tu estado.',
    openVerification: 'Abrir verificación',
    iframeTitle: 'Verificación KYC',
    formHere: 'El formulario de verificación de identidad aparecerá aquí.',
    opensHere: 'La verificación de identidad se abrirá aquí.',
    opensInBrowser:
      'La verificación se abre en tu navegador. Termina los pasos allí y luego vuelve aquí para consultar tu estado.',
    finished: '¿Terminaste los pasos? Consulta tu estado para continuar.',
    checkStatus: 'Consultar estado',
    checking: 'Consultando el estado de la verificación…',
    approved: 'Aprobado',
    result: {
      approved: 'Tu identidad se verificó correctamente.',
      rejected: 'Tu verificación no fue aprobada. Contacta al soporte para conocer los siguientes pasos.',
      expired: 'Tu verificación venció. Empieza de nuevo para verificar tu identidad.',
    },
    startAgain: 'Empezar de nuevo',
    checkAgain: 'Volver a consultar',
    notConfirmed:
      'Todavía no pudimos confirmar tu resultado. Vuelve a consultar en un rato; esto no significa que tu verificación haya sido rechazada.',
    openPageFailed: 'No se pudo abrir la página de verificación. Intenta de nuevo.',
    noSession: 'El proveedor de KYC respondió sin una sesión.',
  },
  pt: {
    errors: {
      SDK_KYC_NOT_CONFIGURED: 'A verificação de identidade ainda não está disponível para este app.',
      SDK_KYC_PROVIDER_ERROR: 'O serviço de verificação não está respondendo agora. Tente de novo em instantes.',
      SDK_KYC_SESSION_EXPIRED: 'Sua sessão de verificação anterior expirou. Escolha o provedor para iniciar uma nova.',
      SDK_KYC_PROVIDER_NOT_FOUND: 'Esta opção de verificação não está mais disponível. Atualize para ver as opções atuais.',
      SDK_KYC_PROVIDER_NOT_ENABLED: 'Esta opção de verificação não está mais disponível. Atualize para ver as opções atuais.',
      SDK_RAMPS_PROVIDER_NOT_CONFIGURED: 'Esta rota ainda não está configurada para a verificação de identidade.',
      VALIDATION_ERROR: 'Esta opção de verificação não está disponível para o seu país.',
    },
    loadFailed: 'Não foi possível carregar as opções de verificação. Atualize para tentar de novo.',
    startFailed: 'Não foi possível iniciar a verificação. Tente de novo.',
    duplicateDocument:
      'Este documento já está vinculado a outra conta, então nossa equipe está analisando. Você pode consultar de novo mais tarde.',
    stillReviewing: 'Sua verificação ainda está em análise. Você pode consultar de novo em breve.',
    processing: 'Sua verificação foi aprovada. Estamos terminando de configurá-la; consulte de novo em um minuto.',
    status: {
      none: 'Não iniciada',
      pending: 'Em análise',
      approved: 'Verificada',
      rejected: 'Rejeitada',
      expired: 'Expirada',
    },
    title: 'Verificação de identidade',
    subtitle: {
      select: 'Escolha seu provedor de verificação',
      verifying: (provider) => `Conclua as etapas com ${provider}`,
      polling: 'Aguardando o resultado da verificação',
      ready: 'Você já pode continuar',
      status: 'O status da sua verificação',
    },
    theProvider: 'o provedor',
    refresh: 'Atualizar',
    refreshProviders: 'Atualizar provedores',
    close: 'Fechar',
    opening: (provider) => `Abrindo ${provider}…`,
    verification: 'a verificação',
    loadingProviders: 'Carregando provedores…',
    noProviders: 'Não há provedores disponíveis para o seu país.',
    openingShort: 'Abrindo…',
    continueNewTab: 'Continuar em uma nova aba',
    continueHere: 'Continuar aqui',
    continueBrowser: 'Continuar no navegador',
    inProgress: 'Verificação em andamento',
    openNewTab: 'Abrir em uma nova aba ↗',
    separateTab: 'Conclua a verificação em outra aba e depois volte aqui para consultar seu status.',
    openVerification: 'Abrir verificação',
    iframeTitle: 'Verificação KYC',
    formHere: 'O formulário de verificação de identidade vai aparecer aqui.',
    opensHere: 'A verificação de identidade vai abrir aqui.',
    opensInBrowser: 'A verificação abre no seu navegador. Conclua as etapas lá e depois volte aqui para consultar seu status.',
    finished: 'Concluiu as etapas? Consulte seu status para continuar.',
    checkStatus: 'Consultar status',
    checking: 'Consultando o status da verificação…',
    approved: 'Aprovada',
    result: {
      approved: 'Sua identidade foi verificada com sucesso.',
      rejected: 'Sua verificação não foi aprovada. Fale com o suporte para saber os próximos passos.',
      expired: 'Sua verificação expirou. Comece de novo para verificar sua identidade.',
    },
    startAgain: 'Começar de novo',
    checkAgain: 'Consultar de novo',
    notConfirmed:
      'Ainda não conseguimos confirmar seu resultado. Consulte de novo em breve; isso não significa que sua verificação foi rejeitada.',
    openPageFailed: 'Não foi possível abrir a página de verificação. Tente de novo.',
    noSession: 'O provedor de KYC respondeu sem uma sessão.',
  },
};
