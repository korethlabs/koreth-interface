'use client';

import {useMemo} from 'react';
import {useReadContract, useReadContracts} from 'wagmi';
import {deployments} from '@/generated/deployments';
import {positionManagerAbi, lpOracleHubAbi} from '@/generated/abis';
import {LIVE_REFETCH_MS} from '@/lib/chain';

// The hub is read off PositionManager rather than from deployments.json so the price shown is by
// construction the one the protocol will use: PositionManager.getPositionValue asks this same hub,
// and getHealthFactor is computed from that. A hub address configured separately in the frontend
// could drift from the one the contracts actually consult.
function useOracleHub(): {hub: `0x${string}` | undefined; isError: boolean} {
  const {data, isError} = useReadContract({address: deployments.positionManager, abi: positionManagerAbi, functionName: 'oracleHub'});
  return {hub: data as `0x${string}` | undefined, isError};
}

/** What to price. `tokenId` is ignored for V2, `amount` for V3 — the oracle reads whichever applies. */
export interface LpPriceQuery {
  lpToken: `0x${string}`;
  tokenId: bigint;
  amount: bigint;
}

export interface LpPrice {
  value: bigint | undefined;
  isError: boolean;
}

/**
 * USD value of collateral that is still in the wallet.
 *
 * `getRawPrice` takes the amount as an argument instead of reading a stored position, which is what
 * lets it value an LP the protocol does not hold yet — `PositionManager.getPositionValue` only
 * works once a position exists.
 *
 * Batched, and takes a list even where the caller has one entry: both deposit sections price
 * several holdings at once, and a hook per row would multiply the round-trips and make the number
 * of hooks vary between renders. The result is positional, so callers index it against the list
 * they passed. Pass a memoized array — the identity drives the query.
 */
export function useLpUsdValues(lpType: number, queries: readonly LpPriceQuery[]): LpPrice[] {
  const {hub, isError: hubError} = useOracleHub();
  const {data, isError: pricesError} = useReadContracts({
    contracts: hub
      ? queries.map((q) => ({
          address: hub,
          abi: lpOracleHubAbi,
          functionName: 'getRawPrice' as const,
          args: [q.lpToken, q.tokenId, q.amount, lpType] as const,
        }))
      : [],
    query: {enabled: !!hub && queries.length > 0, refetchInterval: LIVE_REFETCH_MS},
  });

  return useMemo(
    () =>
      queries.map((_, i) => {
        // Three ways to end up without a price, all of them failures the caller has to be told
        // about. `hubError` is not knowing where the oracle is, which disables the batch below and
        // would otherwise leave every entry looking like one still loading — the state that never
        // resolves. A per-call `failure` is one oracle reverting; `pricesError` is the multicall
        // never landing.
        //
        // A failed refetch leaves the last successful price in the cache, and a price the oracle
        // has since stopped answering for is exactly the one that must not be shown as current —
        // hence the value is dropped rather than kept alongside the flag.
        const failed = hubError || pricesError || data?.[i]?.status === 'failure';
        return {
          value: failed ? undefined : (data?.[i]?.result as bigint | undefined),
          isError: failed,
        };
      }),
    [queries, data, hubError, pricesError],
  );
}
