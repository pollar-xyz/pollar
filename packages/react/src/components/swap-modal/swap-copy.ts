import type { PollarLanguage } from '@pollar/core';

export const SWAP_COPY: Record<
  PollarLanguage,
  {
    title: string;
    back: string;
    refresh: string;
    refreshTitle: string;
    close: string;
    unavailable: string;
    network: string;
    smartUnavailable: string;
    youPay: string;
    youReceive: string;
    balance: string;
    amountToPay: string;
    assetToPay: string;
    assetToReceive: string;
    max: string;
    reverse: string;
    quotedAmount: string;
    customCodePlaceholder: string;
    customIssuerPlaceholder: string;
    addToken: string;
    cancel: string;
    addCustomToken: string;
    updatingRate: string;
    rateUnavailable: string;
    loading: string;
    route: string;
    bestPrice: string;
    noRoute: string;
    minimumReceived: string;
    priceImpact: string;
    trustlineNotice: (code: string) => string;
    sameAsset: string;
    swapButton: string;
    trustlineAndSwap: string;
    appAssets: string;
    otherAssets: string;
    swapping: string;
    swapped: string;
    swapFailed: string;
    confirmSwap: string;
    codeLength: string;
    issuerFormat: string;
    smartNotSupported: string;
    selectBoth: string;
    invalidAmount: string;
    insufficientBalance: string;
    noRouteForPair: string;
    quoteFailed: string;
    receiveOn: string;
    multichainVenue: string;
    fees: Record<'routing' | 'integrator' | 'bridge_and_slippage' | 'other', string>;
    totalFees: string;
    priceRefreshesIn: (seconds: number) => string;
    useTransferForUsdc: string;
    deliveredTo: string;
    settlement: Record<'pending' | 'completed' | 'held' | 'refunded' | 'failed', (chain: string) => string>;
  }
> = {
  en: {
    title: 'Swap',
    back: 'Back',
    refresh: 'Refresh',
    refreshTitle: 'Refresh balances and options',
    close: 'Close',
    unavailable: 'Swap is not available for this app.',
    network: 'Network',
    smartUnavailable: 'Swaps are not yet available for smart (passkey) wallets.',
    youPay: 'You pay',
    youReceive: 'You receive',
    balance: 'Balance:',
    amountToPay: 'Amount to pay',
    assetToPay: 'Asset to pay',
    assetToReceive: 'Asset to receive',
    max: 'Max',
    reverse: 'Swap pay and receive assets',
    quotedAmount: 'Quoted amount',
    customCodePlaceholder: 'Code (e.g. USDC)',
    customIssuerPlaceholder: 'Issuer (G...)',
    addToken: 'Add token',
    cancel: 'Cancel',
    addCustomToken: '+ Add a token by code / issuer',
    updatingRate: 'Updating rate…',
    rateUnavailable: 'Exchange rate unavailable',
    loading: 'Loading',
    route: 'Route',
    bestPrice: 'Best price',
    noRoute: 'No route found for this pair.',
    minimumReceived: 'Minimum received',
    priceImpact: 'Price impact',
    trustlineNotice: (code) =>
      `To receive ${code} your wallet needs a trustline. Swapping will create it first (~0.5 XLM reserve, refundable if you later remove it).`,
    sameAsset: 'Choose two different assets to swap.',
    swapButton: 'Swap',
    trustlineAndSwap: 'Create trustline & swap',
    appAssets: 'App assets',
    otherAssets: 'Other assets',
    swapping: 'Swapping…',
    swapped: 'Swapped!',
    swapFailed: 'Swap failed',
    confirmSwap: 'Confirm Swap',
    codeLength: 'Code must be 1-12 characters',
    issuerFormat: 'Issuer must be a Stellar address (G..., 56 chars)',
    smartNotSupported: 'Swaps are not yet supported for smart (passkey) wallets',
    selectBoth: 'Select both assets',
    invalidAmount: 'Enter a valid amount',
    insufficientBalance: 'Insufficient balance',
    noRouteForPair: 'No route available for this pair',
    quoteFailed: 'Failed to fetch quote',
    receiveOn: 'Receive on',
    multichainVenue: 'Cross-chain route',
    fees: {
      routing: 'Routing fee',
      integrator: 'App fee',
      bridge_and_slippage: 'Network transfer and slippage',
      other: 'Other fees',
    },
    totalFees: 'Total fees',
    priceRefreshesIn: (seconds) => `This price is good for ${seconds}s; a new one is asked for after.`,
    useTransferForUsdc: 'USDC moves between networks with a transfer, not a swap. Choose another asset.',
    deliveredTo: 'Delivered to',
    settlement: {
      pending: (chain) => `Sent from Solana. Delivering to your ${chain} wallet; this updates on its own.`,
      completed: (chain) => `Delivered to your ${chain} wallet.`,
      held: () => 'Support is checking this swap. Your funds are not lost; this updates on its own.',
      refunded: () => 'The delivery did not complete and the funds were returned to your Solana wallet.',
      failed: () => "The delivery did not complete. If your funds do not return, contact this app's support.",
    },
  },
  es: {
    title: 'Intercambiar',
    back: 'Atrás',
    refresh: 'Actualizar',
    refreshTitle: 'Actualizar saldos y opciones',
    close: 'Cerrar',
    unavailable: 'El intercambio no está disponible para esta app.',
    network: 'Red',
    smartUnavailable: 'Los intercambios aún no están disponibles para billeteras inteligentes (passkey).',
    youPay: 'Pagas',
    youReceive: 'Recibes',
    balance: 'Saldo:',
    amountToPay: 'Monto a pagar',
    assetToPay: 'Activo a pagar',
    assetToReceive: 'Activo a recibir',
    max: 'Máx.',
    reverse: 'Invertir activos a pagar y recibir',
    quotedAmount: 'Monto cotizado',
    customCodePlaceholder: 'Código (p. ej. USDC)',
    customIssuerPlaceholder: 'Emisor (G...)',
    addToken: 'Agregar token',
    cancel: 'Cancelar',
    addCustomToken: '+ Agregar un token por código / emisor',
    updatingRate: 'Actualizando tasa…',
    rateUnavailable: 'Tasa de cambio no disponible',
    loading: 'Cargando',
    route: 'Ruta',
    bestPrice: 'Mejor precio',
    noRoute: 'No se encontró una ruta para este par.',
    minimumReceived: 'Mínimo a recibir',
    priceImpact: 'Impacto en el precio',
    trustlineNotice: (code) =>
      `Para recibir ${code}, tu billetera necesita una trustline. El intercambio la creará primero (reserva de ~0.5 XLM, reembolsable si luego la eliminas).`,
    sameAsset: 'Elige dos activos distintos para intercambiar.',
    swapButton: 'Intercambiar',
    trustlineAndSwap: 'Crear trustline e intercambiar',
    appAssets: 'Activos de la app',
    otherAssets: 'Otros activos',
    swapping: 'Intercambiando…',
    swapped: '¡Intercambio listo!',
    swapFailed: 'El intercambio falló',
    confirmSwap: 'Confirmar intercambio',
    codeLength: 'El código debe tener de 1 a 12 caracteres',
    issuerFormat: 'El emisor debe ser una dirección de Stellar (G..., 56 caracteres)',
    smartNotSupported: 'Los intercambios aún no son compatibles con billeteras inteligentes (passkey)',
    selectBoth: 'Selecciona ambos activos',
    invalidAmount: 'Ingresa un monto válido',
    insufficientBalance: 'Saldo insuficiente',
    noRouteForPair: 'No hay una ruta disponible para este par',
    quoteFailed: 'No se pudo obtener la cotización',
    receiveOn: 'Recibir en',
    multichainVenue: 'Ruta entre redes',
    fees: {
      routing: 'Comisión de ruta',
      integrator: 'Comisión de la app',
      bridge_and_slippage: 'Transferencia entre redes y deslizamiento',
      other: 'Otras comisiones',
    },
    totalFees: 'Comisiones totales',
    priceRefreshesIn: (seconds) => `Este precio vale por ${seconds}s; luego se pide uno nuevo.`,
    useTransferForUsdc: 'USDC se mueve entre redes con una transferencia, no con un intercambio. Elige otro activo.',
    deliveredTo: 'Entregado en',
    settlement: {
      pending: (chain) => `Enviado desde Solana. Entregando en tu billetera de ${chain}; esto se actualiza solo.`,
      completed: (chain) => `Entregado en tu billetera de ${chain}.`,
      held: () => 'Soporte está revisando este intercambio. Tus fondos no se perdieron; esto se actualiza solo.',
      refunded: () => 'La entrega no se completó y los fondos volvieron a tu billetera de Solana.',
      failed: () => 'La entrega no se completó. Si tus fondos no vuelven, contacta al soporte de esta app.',
    },
  },
  pt: {
    title: 'Trocar',
    back: 'Voltar',
    refresh: 'Atualizar',
    refreshTitle: 'Atualizar saldos e opções',
    close: 'Fechar',
    unavailable: 'A troca não está disponível para este app.',
    network: 'Rede',
    smartUnavailable: 'As trocas ainda não estão disponíveis para carteiras inteligentes (passkey).',
    youPay: 'Você paga',
    youReceive: 'Você recebe',
    balance: 'Saldo:',
    amountToPay: 'Valor a pagar',
    assetToPay: 'Ativo a pagar',
    assetToReceive: 'Ativo a receber',
    max: 'Máx.',
    reverse: 'Inverter ativos a pagar e receber',
    quotedAmount: 'Valor cotado',
    customCodePlaceholder: 'Código (ex.: USDC)',
    customIssuerPlaceholder: 'Emissor (G...)',
    addToken: 'Adicionar token',
    cancel: 'Cancelar',
    addCustomToken: '+ Adicionar um token por código / emissor',
    updatingRate: 'Atualizando cotação…',
    rateUnavailable: 'Cotação indisponível',
    loading: 'Carregando',
    route: 'Rota',
    bestPrice: 'Melhor preço',
    noRoute: 'Nenhuma rota encontrada para este par.',
    minimumReceived: 'Mínimo a receber',
    priceImpact: 'Impacto no preço',
    trustlineNotice: (code) =>
      `Para receber ${code}, sua carteira precisa de uma trustline. A troca vai criá-la primeiro (reserva de ~0.5 XLM, reembolsável se você removê-la depois).`,
    sameAsset: 'Escolha dois ativos diferentes para trocar.',
    swapButton: 'Trocar',
    trustlineAndSwap: 'Criar trustline e trocar',
    appAssets: 'Ativos do app',
    otherAssets: 'Outros ativos',
    swapping: 'Trocando…',
    swapped: 'Troca concluída!',
    swapFailed: 'A troca falhou',
    confirmSwap: 'Confirmar troca',
    codeLength: 'O código deve ter de 1 a 12 caracteres',
    issuerFormat: 'O emissor deve ser um endereço Stellar (G..., 56 caracteres)',
    smartNotSupported: 'As trocas ainda não são compatíveis com carteiras inteligentes (passkey)',
    selectBoth: 'Selecione os dois ativos',
    invalidAmount: 'Digite um valor válido',
    insufficientBalance: 'Saldo insuficiente',
    noRouteForPair: 'Nenhuma rota disponível para este par',
    quoteFailed: 'Não foi possível obter a cotação',
    receiveOn: 'Receber em',
    multichainVenue: 'Rota entre redes',
    fees: {
      routing: 'Taxa de rota',
      integrator: 'Taxa do app',
      bridge_and_slippage: 'Transferência entre redes e derrapagem',
      other: 'Outras taxas',
    },
    totalFees: 'Taxas totais',
    priceRefreshesIn: (seconds) => `Este preço vale por ${seconds}s; depois um novo é pedido.`,
    useTransferForUsdc: 'USDC se move entre redes com uma transferência, não com uma troca. Escolha outro ativo.',
    deliveredTo: 'Entregue em',
    settlement: {
      pending: (chain) => `Enviado da Solana. Entregando na sua carteira ${chain}; isto se atualiza sozinho.`,
      completed: (chain) => `Entregue na sua carteira ${chain}.`,
      held: () => 'O suporte está verificando esta troca. Seus fundos não foram perdidos; isto se atualiza sozinho.',
      refunded: () => 'A entrega não foi concluída e os fundos voltaram para a sua carteira Solana.',
      failed: () => 'A entrega não foi concluída. Se seus fundos não voltarem, fale com o suporte deste app.',
    },
  },
};
