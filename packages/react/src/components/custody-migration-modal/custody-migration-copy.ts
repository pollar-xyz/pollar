import type { PollarLanguage } from '@pollar/core';

export const CUSTODY_MIGRATION_COPY: Record<
  PollarLanguage,
  {
    title: string;
    intro: string;
    whatMoves: string;
    newAddress: string;
    sameAddress: string;
    and: string;
    addressChanges: (chains: string) => string;
    chooseSigning: string;
    cosignedOption: string;
    selfCustodyOption: string;
    selfCustodyRisks: string;
    acceptRisks: string;
    lastAttemptFailed: string;
    blocked: (reasons: string) => string;
    moving: string;
    move: string;
    later: string;
    logout: string;
  }
> = {
  en: {
    title: 'Move your wallets to this device',
    intro:
      "Until now Pollar held the keys of your wallets. This app now keeps wallets on its users' devices, so they move here, with everything they hold.",
    whatMoves: 'What moves',
    newAddress: 'New address',
    sameAddress: 'Same address',
    and: ' and ',
    addressChanges: (chains) =>
      `Your ${chains} address changes: every token and the balance go to a new address on this device. Stop sharing the old one; anything sent there later needs help from support to recover.`,
    chooseSigning: 'Choose how your wallet signs',
    cosignedOption: 'Co-signed: you and the app approve every signature together, and the wallet can be recovered with help.',
    selfCustodyOption: 'Self-custody: only your device signs. Nobody else can move or recover your funds.',
    selfCustodyRisks:
      'In a self-custody wallet only your device can sign. If you lose this device and every recovery method, nobody can recover the wallet or its funds, not the app and not Pollar. Nobody can undo or freeze a transaction you sign.',
    acceptRisks: 'I understand and accept these risks',
    lastAttemptFailed: 'The last attempt did not finish. What did not move is still where it was; try again.',
    blocked: (reasons) => `A wallet cannot move while something still uses it: ${reasons}. Let it finish and try again.`,
    moving: 'Moving your wallets...',
    move: 'Move my wallets',
    later: 'Continue for now',
    logout: 'Log out',
  },
  es: {
    title: 'Mueve tus billeteras a este dispositivo',
    intro:
      'Hasta ahora Pollar guardaba las llaves de tus billeteras. Esta app ahora guarda las billeteras en los dispositivos de sus usuarios, así que se mueven aquí con todo lo que contienen.',
    whatMoves: 'Qué se mueve',
    newAddress: 'Dirección nueva',
    sameAddress: 'Misma dirección',
    and: ' y ',
    addressChanges: (chains) =>
      `Tu dirección de ${chains} cambia: todos los tokens y el saldo pasan a una dirección nueva en este dispositivo. Deja de compartir la anterior; lo que se envíe ahí después necesitará ayuda de soporte para recuperarse.`,
    chooseSigning: 'Elige cómo firma tu billetera',
    cosignedOption: 'Cofirmada: tú y la app aprueban juntos cada firma, y la billetera se puede recuperar con ayuda.',
    selfCustodyOption: 'Autocustodia: solo tu dispositivo firma. Nadie más puede mover ni recuperar tus fondos.',
    selfCustodyRisks:
      'En una billetera de autocustodia solo tu dispositivo puede firmar. Si pierdes este dispositivo y todos tus métodos de recuperación, nadie podrá recuperar la billetera ni sus fondos: ni la app ni Pollar. Nadie puede deshacer ni congelar una transacción que firmes.',
    acceptRisks: 'Entiendo y acepto estos riesgos',
    lastAttemptFailed: 'El último intento no terminó. Lo que no se movió sigue donde estaba; intenta de nuevo.',
    blocked: (reasons) =>
      `Una billetera no se puede mover mientras algo todavía la usa: ${reasons}. Espera a que termine e intenta de nuevo.`,
    moving: 'Moviendo tus billeteras...',
    move: 'Mover mis billeteras',
    later: 'Continuar por ahora',
    logout: 'Cerrar sesión',
  },
  pt: {
    title: 'Mova suas carteiras para este dispositivo',
    intro:
      'Até agora a Pollar guardava as chaves das suas carteiras. Este app agora mantém as carteiras nos dispositivos dos usuários, então elas vêm para cá com tudo o que contêm.',
    whatMoves: 'O que será movido',
    newAddress: 'Endereço novo',
    sameAddress: 'Mesmo endereço',
    and: ' e ',
    addressChanges: (chains) =>
      `Seu endereço de ${chains} muda: todos os tokens e o saldo vão para um endereço novo neste dispositivo. Pare de compartilhar o antigo; o que for enviado para ele depois precisará de ajuda do suporte para ser recuperado.`,
    chooseSigning: 'Escolha como sua carteira assina',
    cosignedOption: 'Coassinada: você e o app aprovam juntos cada assinatura, e a carteira pode ser recuperada com ajuda.',
    selfCustodyOption: 'Autocustódia: só o seu dispositivo assina. Ninguém mais pode movimentar ou recuperar seus fundos.',
    selfCustodyRisks:
      'Em uma carteira de autocustódia só o seu dispositivo pode assinar. Se você perder este dispositivo e todos os métodos de recuperação, ninguém poderá recuperar a carteira nem seus fundos: nem o app nem a Pollar. Ninguém pode desfazer ou congelar uma transação que você assinar.',
    acceptRisks: 'Entendo e aceito esses riscos',
    lastAttemptFailed: 'A última tentativa não terminou. O que não foi movido continua onde estava; tente novamente.',
    blocked: (reasons) =>
      `Uma carteira não pode ser movida enquanto algo ainda a usa: ${reasons}. Espere terminar e tente novamente.`,
    moving: 'Movendo suas carteiras...',
    move: 'Mover minhas carteiras',
    later: 'Continuar por enquanto',
    logout: 'Sair',
  },
};
