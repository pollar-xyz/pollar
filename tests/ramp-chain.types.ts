import {
  RampChain,
  type PollarClient,
  type pollarPaths,
  type RampOrder,
  type RampQuote,
  type RampQuoteRequest,
  type RampRoute,
} from '../packages/core/dist/index';
import { RampChain as NativeRampChain } from '../packages/core/dist/index.rn';

type Assert<T extends true> = T;
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Chains<T> = T extends readonly (infer Item)[]
  ? Chains<Item>
  : T extends object
    ? {
        [Key in keyof T]-?: Key extends 'chain' ? NonNullable<T[Key]> : Chains<T[Key]>;
      }[keyof T]
    : never;
type RampPaths = Pick<pollarPaths, Extract<keyof pollarPaths, `/ramps/${string}`>>;

// Any OpenAPI regeneration that widens even one ramp chain field fails this check.
export type AllRampApiChainsAreClosed = Assert<Equal<Chains<RampPaths>, RampChain>>;
export type ExactCatalog = Assert<Equal<RampChain, 'STELLAR' | 'POLYGON' | 'SOLANA'>>;
export type NativeCatalog = Assert<Equal<typeof NativeRampChain, typeof RampChain>>;
export type RouteChain = Assert<Equal<RampRoute['asset']['chain'], RampChain>>;
export type QuoteAmounts = Assert<Equal<RampQuote['amountIn'] | RampQuote['amountOut'], string>>;
export type LegAmounts = Assert<Equal<RampOrder['legs'][number]['amountOutPlanned'], string>>;

declare const client: PollarClient;
declare const request: RampQuoteRequest;
declare const route: RampRoute;
for (const chain of [RampChain.STELLAR, RampChain.POLYGON, RampChain.SOLANA]) {
  client.quoteRamp({ ...request, asset: { ...request.asset, chain } });
  client.registerRampSigningHandler(chain, 'custom-encoding', async () => 'signed');
}
client.registerRampSigningHandler('SOLANA', 'custom-encoding', async () => 'signed');
// @ts-expect-error Lowercase is not a ramp chain.
client.quoteRamp({ ...request, asset: { ...request.asset, chain: 'solana' } });
// @ts-expect-error CAIP-2 belongs to a derived identifier, not the chain field.
client.quoteRamp({ ...request, asset: { ...request.asset, chain: 'eip155:137' } });
// @ts-expect-error A new chain needs a backend enum migration and SDK update.
client.registerRampSigningHandler('FUTURE_CHAIN', 'custom-encoding', async () => 'signed');
// @ts-expect-error Route assets use the same closed catalog.
route.asset.chain = 'polygon';
// @ts-expect-error Exact amounts cannot be replaced by floating point numbers.
client.quoteRamp({ ...request, amount: { value: 1.5, denomination: 'in' } });
