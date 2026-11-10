import type { PollarLanguage } from '@pollar/core';

export interface BridgeCopy {
  title: string;
  close: string;
  back: string;
  loading: string;
  mainnetOnly: string;
  noDirections: string;
  from: string;
  to: string;
  amount: string;
  balance: string;
  max: string;
  youReceive: string;
  fee: string;
  noFee: string;
  eta: string;
  etaValue: string;
  signingInternal: string;
  signingCosigned: string;
  signingExternal: string;
  quoting: string;
  bridgeButton: string;
  starting: string;
  invalidAmount: string;
  overBalance: string;
  statusTitle: Record<'PENDING' | 'AWAITING_ACTION' | 'BURNED' | 'ATTESTED' | 'COMPLETED' | 'FAILED' | 'HELD', string>;
  statusBody: Record<'PENDING' | 'AWAITING_ACTION' | 'BURNED' | 'ATTESTED' | 'COMPLETED' | 'FAILED' | 'HELD', string>;
  steps: { burn: string; attest: string; mint: string };
  authorize: string;
  waitingWallet: string;
  approveOnDevice: string;
  viewBurn: string;
  viewMint: string;
  done: string;
  newBridge: string;
  pollTrouble: string;
  errors: {
    mainnetOnly: string;
    chainNotEnabled: string;
    noGasWallet: string;
    noWallet: (chain: string) => string;
    noTrustline: string;
    connectSolanaWallet: string;
    unsupportedWallet: string;
    credits: string;
    actionChanged: string;
    connectStellarWallet: string;
    walletChanged: string;
    signingCancelled: string;
    generic: string;
  };
}

export const BRIDGE_COPY: Record<PollarLanguage, BridgeCopy> = {
  en: {
    title: 'Move USDC between networks',
    close: 'Close',
    back: 'Back',
    loading: 'Loading…',
    mainnetOnly: 'Moving USDC between networks works on mainnet only.',
    noDirections: 'You need a wallet on at least two networks of this app to move USDC between them.',
    from: 'From',
    to: 'To',
    amount: 'Amount (USDC)',
    balance: 'Balance',
    max: 'Max',
    youReceive: 'You receive',
    fee: 'Fee',
    noFee: 'No fee',
    eta: 'Estimated time',
    etaValue: 'about {minutes} min',
    signingInternal: 'Your wallet sends it right away.',
    signingCosigned: 'You approve it on your device.',
    signingExternal: 'You sign it in your wallet.',
    quoting: 'Getting a quote…',
    bridgeButton: 'Move USDC',
    starting: 'Starting…',
    invalidAmount: 'Enter an amount with up to 6 decimals.',
    overBalance: 'The amount is more than your balance.',
    statusTitle: {
      PENDING: 'Sending',
      AWAITING_ACTION: 'Your approval is needed',
      BURNED: 'On its way',
      ATTESTED: 'Arriving',
      COMPLETED: 'Done',
      FAILED: 'It did not go through',
      HELD: 'Under review',
    },
    statusBody: {
      PENDING: 'Your USDC is leaving your {from} wallet.',
      AWAITING_ACTION: 'Approve the step below to continue.',
      BURNED: 'Circle is confirming the transfer. This takes a few minutes.',
      ATTESTED: 'Your USDC is being delivered to your {to} wallet.',
      COMPLETED: '{amount} USDC arrived in your {to} wallet.',
      FAILED: 'Nothing left your wallet. You can try again.',
      HELD: 'Your USDC left your {from} wallet but did not arrive yet. Our team is on it; no action is needed from you.',
    },
    steps: { burn: 'Leaves {from}', attest: 'Confirmed by Circle', mint: 'Arrives on {to}' },
    authorize: 'Authorize',
    waitingWallet: 'Waiting for your wallet…',
    approveOnDevice: 'Approve on your device',
    viewBurn: 'View on {chain}',
    viewMint: 'View on {chain}',
    done: 'Done',
    newBridge: 'Move more',
    pollTrouble: 'We could not refresh the status. Retrying…',
    errors: {
      mainnetOnly: 'Moving USDC between networks works on mainnet only.',
      chainNotEnabled: 'This app does not use one of these networks.',
      noGasWallet: 'This app cannot pay the network fees for this move right now.',
      noWallet: (chain) => `You do not have a wallet on ${chain} yet.`,
      noTrustline: 'Your Stellar wallet needs to accept USDC first.',
      connectSolanaWallet: 'Connect the Solana wallet this move leaves from to sign.',
      unsupportedWallet: 'This wallet cannot move USDC between networks.',
      credits: 'This app cannot cover this operation right now.',
      actionChanged: 'The step changed. Review it and authorize again.',
      connectStellarWallet: 'Connect your Stellar wallet to sign.',
      walletChanged: 'The connected wallet changed. Try again.',
      signingCancelled: 'The signature was cancelled.',
      generic: 'Something went wrong. Try again.',
    },
  },
  es: {
    title: 'Mover USDC entre redes',
    close: 'Cerrar',
    back: 'Volver',
    loading: 'Cargando…',
    mainnetOnly: 'Mover USDC entre redes solo funciona en mainnet.',
    noDirections: 'Necesitas una wallet en al menos dos redes de esta app para mover USDC entre ellas.',
    from: 'Desde',
    to: 'Hacia',
    amount: 'Monto (USDC)',
    balance: 'Saldo',
    max: 'Máx',
    youReceive: 'Recibes',
    fee: 'Comisión',
    noFee: 'Sin comisión',
    eta: 'Tiempo estimado',
    etaValue: 'unos {minutes} min',
    signingInternal: 'Tu wallet lo envía de inmediato.',
    signingCosigned: 'Lo apruebas en tu dispositivo.',
    signingExternal: 'Lo firmas en tu wallet.',
    quoting: 'Cotizando…',
    bridgeButton: 'Mover USDC',
    starting: 'Iniciando…',
    invalidAmount: 'Ingresa un monto con hasta 6 decimales.',
    overBalance: 'El monto es mayor que tu saldo.',
    statusTitle: {
      PENDING: 'Enviando',
      AWAITING_ACTION: 'Falta tu aprobación',
      BURNED: 'En camino',
      ATTESTED: 'Llegando',
      COMPLETED: 'Listo',
      FAILED: 'No se completó',
      HELD: 'En revisión',
    },
    statusBody: {
      PENDING: 'Tu USDC está saliendo de tu wallet de {from}.',
      AWAITING_ACTION: 'Aprueba el paso de abajo para continuar.',
      BURNED: 'Circle está confirmando la transferencia. Tarda unos minutos.',
      ATTESTED: 'Tu USDC se está entregando en tu wallet de {to}.',
      COMPLETED: 'Llegaron {amount} USDC a tu wallet de {to}.',
      FAILED: 'No salió nada de tu wallet. Puedes intentarlo de nuevo.',
      HELD: 'Tu USDC salió de tu wallet de {from} pero todavía no llegó. Nuestro equipo ya lo está revisando; no tienes que hacer nada.',
    },
    steps: { burn: 'Sale de {from}', attest: 'Confirmado por Circle', mint: 'Llega a {to}' },
    authorize: 'Autorizar',
    waitingWallet: 'Esperando a tu wallet…',
    approveOnDevice: 'Aprobar en tu dispositivo',
    viewBurn: 'Ver en {chain}',
    viewMint: 'Ver en {chain}',
    done: 'Listo',
    newBridge: 'Mover más',
    pollTrouble: 'No pudimos actualizar el estado. Reintentando…',
    errors: {
      mainnetOnly: 'Mover USDC entre redes solo funciona en mainnet.',
      chainNotEnabled: 'Esta app no usa una de estas redes.',
      noGasWallet: 'Esta app no puede pagar ahora las comisiones de red de este movimiento.',
      noWallet: (chain) => `Todavía no tienes una wallet en ${chain}.`,
      noTrustline: 'Tu wallet de Stellar primero tiene que aceptar USDC.',
      connectSolanaWallet: 'Conecta la wallet de Solana desde la que sale este movimiento para firmar.',
      unsupportedWallet: 'Esta wallet no puede mover USDC entre redes.',
      credits: 'Esta app no puede cubrir esta operación ahora.',
      actionChanged: 'El paso cambió. Revísalo y autoriza de nuevo.',
      connectStellarWallet: 'Conecta tu wallet de Stellar para firmar.',
      walletChanged: 'Cambió la wallet conectada. Inténtalo de nuevo.',
      signingCancelled: 'Se canceló la firma.',
      generic: 'Algo salió mal. Inténtalo de nuevo.',
    },
  },
  pt: {
    title: 'Mover USDC entre redes',
    close: 'Fechar',
    back: 'Voltar',
    loading: 'Carregando…',
    mainnetOnly: 'Mover USDC entre redes funciona só na mainnet.',
    noDirections: 'Você precisa de uma carteira em pelo menos duas redes deste app para mover USDC entre elas.',
    from: 'De',
    to: 'Para',
    amount: 'Valor (USDC)',
    balance: 'Saldo',
    max: 'Máx',
    youReceive: 'Você recebe',
    fee: 'Taxa',
    noFee: 'Sem taxa',
    eta: 'Tempo estimado',
    etaValue: 'cerca de {minutes} min',
    signingInternal: 'Sua carteira envia na hora.',
    signingCosigned: 'Você aprova no seu dispositivo.',
    signingExternal: 'Você assina na sua carteira.',
    quoting: 'Cotando…',
    bridgeButton: 'Mover USDC',
    starting: 'Iniciando…',
    invalidAmount: 'Informe um valor com até 6 casas decimais.',
    overBalance: 'O valor é maior que o seu saldo.',
    statusTitle: {
      PENDING: 'Enviando',
      AWAITING_ACTION: 'Falta a sua aprovação',
      BURNED: 'A caminho',
      ATTESTED: 'Chegando',
      COMPLETED: 'Pronto',
      FAILED: 'Não foi concluído',
      HELD: 'Em análise',
    },
    statusBody: {
      PENDING: 'Seu USDC está saindo da sua carteira na {from}.',
      AWAITING_ACTION: 'Aprove o passo abaixo para continuar.',
      BURNED: 'A Circle está confirmando a transferência. Leva alguns minutos.',
      ATTESTED: 'Seu USDC está sendo entregue na sua carteira na {to}.',
      COMPLETED: '{amount} USDC chegaram na sua carteira na {to}.',
      FAILED: 'Nada saiu da sua carteira. Você pode tentar de novo.',
      HELD: 'Seu USDC saiu da sua carteira na {from} mas ainda não chegou. Nossa equipe já está cuidando disso; você não precisa fazer nada.',
    },
    steps: { burn: 'Sai da {from}', attest: 'Confirmado pela Circle', mint: 'Chega na {to}' },
    authorize: 'Autorizar',
    waitingWallet: 'Aguardando sua carteira…',
    approveOnDevice: 'Aprovar no dispositivo',
    viewBurn: 'Ver na {chain}',
    viewMint: 'Ver na {chain}',
    done: 'Pronto',
    newBridge: 'Mover mais',
    pollTrouble: 'Não conseguimos atualizar o status. Tentando de novo…',
    errors: {
      mainnetOnly: 'Mover USDC entre redes funciona só na mainnet.',
      chainNotEnabled: 'Este app não usa uma dessas redes.',
      noGasWallet: 'Este app não consegue pagar agora as taxas de rede deste movimento.',
      noWallet: (chain) => `Você ainda não tem uma carteira na ${chain}.`,
      noTrustline: 'Sua carteira Stellar precisa aceitar USDC primeiro.',
      connectSolanaWallet: 'Conecte a carteira Solana de onde sai este movimento para assinar.',
      unsupportedWallet: 'Esta carteira não pode mover USDC entre redes.',
      credits: 'Este app não consegue cobrir esta operação agora.',
      actionChanged: 'O passo mudou. Revise e autorize de novo.',
      connectStellarWallet: 'Conecte sua carteira Stellar para assinar.',
      walletChanged: 'A carteira conectada mudou. Tente de novo.',
      signingCancelled: 'A assinatura foi cancelada.',
      generic: 'Algo deu errado. Tente de novo.',
    },
  },
};
