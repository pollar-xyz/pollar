import type { PollarLanguage } from '@pollar/core';

export const EARN_COPY: Record<
  PollarLanguage,
  {
    title: string;
    back: string;
    refresh: string;
    close: string;
    unavailable: string;
    smartUnavailable: string;
    deposit: string;
    withdraw: string;
    provider: string;
    vault: string;
    pool: string;
    loadingOptions: string;
    noneAvailable: string;
    inYourWallet: string;
    yourPosition: string;
    amount: string;
    withdrawAmount: string;
    shares: string;
    trustlineNotice: (code: string) => string;
    trustlineAndDeposit: string;
    depositing: string;
    withdrawing: string;
    done: string;
    depositFailed: string;
    withdrawFailed: string;
    confirm: string;
    smartNotSupported: string;
    selectOpportunity: string;
    invalidAmount: string;
    exceedsWallet: string;
    exceedsPosition: string;
    trustlineFailed: (code: string, details: string) => string;
    unknownError: string;
  }
> = {
  en: {
    title: 'Earn',
    back: 'Back',
    refresh: 'Refresh',
    close: 'Close',
    unavailable: 'Earn is not available for this app.',
    smartUnavailable: 'Earn is not yet available for smart (passkey) wallets.',
    deposit: 'Deposit',
    withdraw: 'Withdraw',
    provider: 'Provider',
    vault: 'Vault',
    pool: 'Pool',
    loadingOptions: 'Loading options…',
    noneAvailable: 'None available',
    inYourWallet: 'In your wallet',
    yourPosition: 'Your position',
    amount: 'Amount',
    withdrawAmount: 'Withdraw amount',
    shares: 'shares',
    trustlineNotice: (code) =>
      `To deposit ${code} your wallet needs a trustline. This will create it first (~0.5 XLM reserve, refundable if you later remove it), then deposit — two signatures.`,
    trustlineAndDeposit: 'Enable trustline & deposit',
    depositing: 'Depositing…',
    withdrawing: 'Withdrawing…',
    done: 'Done!',
    depositFailed: 'Deposit failed',
    withdrawFailed: 'Withdraw failed',
    confirm: 'Confirm',
    smartNotSupported: 'Earn is not yet supported for smart (passkey) wallets',
    selectOpportunity: 'Select a vault or pool',
    invalidAmount: 'Enter a valid amount',
    exceedsWallet: 'Amount exceeds your wallet balance',
    exceedsPosition: 'Amount exceeds your position',
    trustlineFailed: (code, details) => `Trustline for ${code} failed: ${details}`,
    unknownError: 'unknown error',
  },
  es: {
    title: 'Rendimientos',
    back: 'Atrás',
    refresh: 'Actualizar',
    close: 'Cerrar',
    unavailable: 'Rendimientos no está disponible para esta app.',
    smartUnavailable: 'Rendimientos aún no está disponible para billeteras inteligentes (passkey).',
    deposit: 'Depositar',
    withdraw: 'Retirar',
    provider: 'Proveedor',
    vault: 'Bóveda',
    pool: 'Pool',
    loadingOptions: 'Cargando opciones…',
    noneAvailable: 'No hay opciones disponibles',
    inYourWallet: 'En tu billetera',
    yourPosition: 'Tu posición',
    amount: 'Monto',
    withdrawAmount: 'Monto a retirar',
    shares: 'participaciones',
    trustlineNotice: (code) =>
      `Para depositar ${code}, tu billetera necesita una trustline. Primero se creará (reserva de ~0.5 XLM, reembolsable si luego la eliminas) y luego se hará el depósito: dos firmas.`,
    trustlineAndDeposit: 'Activar trustline y depositar',
    depositing: 'Depositando…',
    withdrawing: 'Retirando…',
    done: '¡Listo!',
    depositFailed: 'El depósito falló',
    withdrawFailed: 'El retiro falló',
    confirm: 'Confirmar',
    smartNotSupported: 'Rendimientos aún no es compatible con billeteras inteligentes (passkey)',
    selectOpportunity: 'Selecciona una bóveda o un pool',
    invalidAmount: 'Ingresa un monto válido',
    exceedsWallet: 'El monto supera el saldo de tu billetera',
    exceedsPosition: 'El monto supera tu posición',
    trustlineFailed: (code, details) => `No se pudo crear la trustline de ${code}: ${details}`,
    unknownError: 'error desconocido',
  },
  pt: {
    title: 'Rendimentos',
    back: 'Voltar',
    refresh: 'Atualizar',
    close: 'Fechar',
    unavailable: 'Rendimentos não está disponível para este app.',
    smartUnavailable: 'Rendimentos ainda não está disponível para carteiras inteligentes (passkey).',
    deposit: 'Depositar',
    withdraw: 'Sacar',
    provider: 'Provedor',
    vault: 'Cofre',
    pool: 'Pool',
    loadingOptions: 'Carregando opções…',
    noneAvailable: 'Nenhuma opção disponível',
    inYourWallet: 'Na sua carteira',
    yourPosition: 'Sua posição',
    amount: 'Valor',
    withdrawAmount: 'Valor a sacar',
    shares: 'cotas',
    trustlineNotice: (code) =>
      `Para depositar ${code}, sua carteira precisa de uma trustline. Ela será criada primeiro (reserva de ~0.5 XLM, reembolsável se você removê-la depois) e depois o depósito é feito: duas assinaturas.`,
    trustlineAndDeposit: 'Ativar trustline e depositar',
    depositing: 'Depositando…',
    withdrawing: 'Sacando…',
    done: 'Pronto!',
    depositFailed: 'O depósito falhou',
    withdrawFailed: 'O saque falhou',
    confirm: 'Confirmar',
    smartNotSupported: 'Rendimentos ainda não é compatível com carteiras inteligentes (passkey)',
    selectOpportunity: 'Selecione um cofre ou pool',
    invalidAmount: 'Digite um valor válido',
    exceedsWallet: 'O valor excede o saldo da sua carteira',
    exceedsPosition: 'O valor excede a sua posição',
    trustlineFailed: (code, details) => `Não foi possível criar a trustline de ${code}: ${details}`,
    unknownError: 'erro desconhecido',
  },
};
