/**
 * Decimal ↔ base-unit conversion for on-chain amounts.
 *
 * Chains disagree on what an "amount" is. Stellar's API takes a decimal string
 * ("1.5"); Solana and EVM take integer base units (1500000000 lamports). Balances
 * are always shown to the user as decimals, so a UI that sends to a base-unit
 * chain has to convert — and getting it wrong silently sends the wrong amount.
 *
 * The arithmetic is string + BigInt, never float: `parseFloat('0.1') * 1e9` is
 * 100000000.00000001, and at 18 decimals a float cannot represent the value at
 * all. Money must not round.
 */

/**
 * "1.5" with 9 decimals → "1500000000".
 *
 * Throws on anything that is not a plain non-negative decimal, and on more
 * fractional digits than the asset has — silently truncating there would send
 * less than the user typed.
 */
export function toBaseUnits(amount: string, decimals: number): string {
  const trimmed = amount.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error(`Invalid amount "${amount}": expected a non-negative decimal number.`);
  }
  if (!Number.isInteger(decimals) || decimals < 0) {
    throw new Error(`Invalid decimals "${decimals}".`);
  }

  const [whole = '0', fraction = ''] = trimmed.split('.');
  if (fraction.length > decimals) {
    throw new Error(`Amount "${amount}" has more than ${decimals} decimal places.`);
  }

  // Right-pad the fraction to exactly `decimals` digits, then the whole thing is
  // one integer literal — no division, so nothing to round.
  const padded = fraction.padEnd(decimals, '0');
  return BigInt(whole + padded).toString();
}

/** "1500000000" with 9 decimals → "1.5". Inverse of {@link toBaseUnits}. */
export function fromBaseUnits(base: string, decimals: number): string {
  const trimmed = base.trim();
  if (!/^\d+$/.test(trimmed)) {
    throw new Error(`Invalid base-unit amount "${base}": expected a non-negative integer.`);
  }
  if (decimals === 0) return trimmed;

  const padded = trimmed.padStart(decimals + 1, '0');
  const whole = padded.slice(0, -decimals);
  const fraction = padded.slice(-decimals).replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole;
}
