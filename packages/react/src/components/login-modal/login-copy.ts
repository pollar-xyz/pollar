import type { AuthState, PollarLanguage } from '@pollar/core';

export const LOGIN_COPY: Record<
  PollarLanguage,
  {
    subtitle: string;
    emailPlaceholder: string;
    submit: string;
    orContinueWith: string;
    back: string;
    close: string;
    wallet: string;
    createNewWallet: string;
    loginExistingWallet: string;
    loading: string;
    loadError: string;
    tryAgain: string;
    genericError: string;
    codeLabel: string;
    yourEmail: string;
    codePlaceholder: string;
    verifyCode: string;
    status: Record<AuthState['step'], string>;
  }
> = {
  en: {
    subtitle: 'Log in or sign up',
    emailPlaceholder: 'you@email.com',
    submit: 'Submit',
    orContinueWith: 'or continue with',
    back: 'Back',
    close: 'Close',
    wallet: 'Wallet',
    createNewWallet: 'Create a new wallet',
    loginExistingWallet: 'Log in with an existing wallet',
    loading: 'Loading...',
    loadError: 'Could not load sign-in options. Check your connection and try again.',
    tryAgain: 'Try again',
    genericError: 'Something went wrong. Please try again.',
    codeLabel: 'Enter the 6-digit code sent to',
    yourEmail: 'your email',
    codePlaceholder: 'Enter verification code',
    verifyCode: 'Verify Code',
    status: {
      idle: '',
      creating_session: 'Initializing…',
      entering_email: '',
      sending_email: 'Sending…',
      entering_code: 'Code sent — check your inbox',
      verifying_email_code: 'Verifying…',
      opening_oauth: 'Redirecting…',
      connecting_wallet: 'Connecting wallet…',
      signing_wallet_challenge: 'Confirm in your wallet…',
      wallet_not_installed: 'Wallet not installed',
      authenticating_wallet: 'Signing in with wallet…',
      creating_passkey: 'Waiting for passkey…',
      deploying_smart_account: 'Creating your wallet…',
      authenticating: 'Authenticating…',
      authenticated: 'Welcome!',
      error: '',
    },
  },
  es: {
    subtitle: 'Inicia sesión o regístrate',
    emailPlaceholder: 'tu@correo.com',
    submit: 'Continuar',
    orContinueWith: 'o continúa con',
    back: 'Atrás',
    close: 'Cerrar',
    wallet: 'Billetera',
    createNewWallet: 'Crear una billetera nueva',
    loginExistingWallet: 'Entrar con una billetera existente',
    loading: 'Cargando...',
    loadError: 'No se pudieron cargar las opciones de inicio de sesión. Revisa tu conexión e intenta de nuevo.',
    tryAgain: 'Intentar de nuevo',
    genericError: 'Algo salió mal. Intenta de nuevo.',
    codeLabel: 'Ingresa el código de 6 dígitos que enviamos a',
    yourEmail: 'tu correo',
    codePlaceholder: 'Ingresa el código de verificación',
    verifyCode: 'Verificar código',
    status: {
      idle: '',
      creating_session: 'Iniciando…',
      entering_email: '',
      sending_email: 'Enviando…',
      entering_code: 'Código enviado — revisa tu bandeja de entrada',
      verifying_email_code: 'Verificando…',
      opening_oauth: 'Redirigiendo…',
      connecting_wallet: 'Conectando billetera…',
      signing_wallet_challenge: 'Confirma en tu billetera…',
      wallet_not_installed: 'Billetera no instalada',
      authenticating_wallet: 'Entrando con la billetera…',
      creating_passkey: 'Esperando la passkey…',
      deploying_smart_account: 'Creando tu billetera…',
      authenticating: 'Autenticando…',
      authenticated: '¡Te damos la bienvenida!',
      error: '',
    },
  },
  pt: {
    subtitle: 'Entre ou cadastre-se',
    emailPlaceholder: 'seu@email.com',
    submit: 'Continuar',
    orContinueWith: 'ou continue com',
    back: 'Voltar',
    close: 'Fechar',
    wallet: 'Carteira',
    createNewWallet: 'Criar uma carteira nova',
    loginExistingWallet: 'Entrar com uma carteira existente',
    loading: 'Carregando...',
    loadError: 'Não foi possível carregar as opções de login. Verifique sua conexão e tente novamente.',
    tryAgain: 'Tentar novamente',
    genericError: 'Algo deu errado. Tente novamente.',
    codeLabel: 'Digite o código de 6 dígitos enviado para',
    yourEmail: 'seu e-mail',
    codePlaceholder: 'Digite o código de verificação',
    verifyCode: 'Verificar código',
    status: {
      idle: '',
      creating_session: 'Iniciando…',
      entering_email: '',
      sending_email: 'Enviando…',
      entering_code: 'Código enviado — confira sua caixa de entrada',
      verifying_email_code: 'Verificando…',
      opening_oauth: 'Redirecionando…',
      connecting_wallet: 'Conectando carteira…',
      signing_wallet_challenge: 'Confirme na sua carteira…',
      wallet_not_installed: 'Carteira não instalada',
      authenticating_wallet: 'Entrando com a carteira…',
      creating_passkey: 'Aguardando a passkey…',
      deploying_smart_account: 'Criando sua carteira…',
      authenticating: 'Autenticando…',
      authenticated: 'Boas-vindas!',
      error: '',
    },
  },
};
