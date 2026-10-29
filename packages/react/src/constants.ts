export const LOGO_POLLAR_WORDMARK_ON_LIGHT = 'https://www.pollar.xyz/brandkit/pollar-logo-horizontal-on-light.png';
export const LOGO_POLLAR_WORDMARK_ON_DARK = 'https://www.pollar.xyz/brandkit/pollar-logo-horizontal-on-dark.png';
export const LOGO_POLLAR_MARK_ON_LIGHT = 'https://www.pollar.xyz/brandkit/pollar-mark-on-light.png';
export const LOGO_POLLAR_MARK_ON_DARK = 'https://www.pollar.xyz/brandkit/pollar-mark-on-dark.png';
export const LOGO_GITHUB = 'https://pollar.xyz/assets/GitHub_Invertocat_White.png';
export const LOGO_FREIGHTER = 'https://pollar.xyz/assets/logo_freighter.png';
export const LOGO_ALBEDO = 'https://pollar.xyz/assets/logo_albedo.svg';

/** Chain logos the approval and transaction screens draw, served from the landing site's `public/chains`. */
export const CHAIN_LOGOS: Record<'STELLAR' | 'POLYGON' | 'SOLANA', string> = {
  STELLAR: 'https://www.pollar.xyz/chains/stellar.png',
  POLYGON: 'https://www.pollar.xyz/chains/polygon.png',
  SOLANA: 'https://www.pollar.xyz/chains/solana.png',
};

/**
 * Asset logos by code, served from the landing site's `public/tokens`. Only the
 * codes listed here are requested; any other asset shows its initial instead,
 * so an asset without a file never costs a 404.
 */
export const TOKEN_LOGOS: Record<string, string> = {
  USDC: 'https://www.pollar.xyz/tokens/usdc.png',
  USDT: 'https://www.pollar.xyz/tokens/usdt.png',
  EURC: 'https://www.pollar.xyz/tokens/eurc.png',
  XLM: 'https://www.pollar.xyz/tokens/xlm.png',
  SOL: 'https://www.pollar.xyz/tokens/sol.png',
  POL: 'https://www.pollar.xyz/tokens/pol.png',
};
