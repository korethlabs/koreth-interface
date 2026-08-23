'use client';

import {useReadContracts} from 'wagmi';
import {erc20Abi} from 'viem';
import {v2PairAbi} from '@/lib/v2';
import {LIVE_REFETCH_MS} from '@/lib/chain';

export type V2Underlying = {
  token0: `0x${string}`;
  token1: `0x${string}`;
  amount0: bigint;
  amount1: bigint;
};

/**
 * The two token amounts an LP balance is a claim on, which is the only form of it a user can check
 * against anything they already know.
 *
 * An LP count cannot be sanity-checked: a WETH/USDC balance reads as 0.000084 for a five-figure
 * position, because the pair's total supply is the geometric mean of a 6- and an 18-decimal reserve.
 * The underlying amounts are the figures the user chose when they added liquidity, and the ones
 * Uniswap shows for the same balance.
 *
 * This is burn()'s own arithmetic — `amount_i = balance × reserve_i / totalSupply` — so it is what
 * removing the liquidity right now would pay out, minus one detail: burn() divides the pair's live
 * token balances rather than the stored reserves, so a donation made since the last sync is not
 * counted here. It is a display of composition, not a quote; the USD figure beside it comes from
 * the oracle, and nothing is gated on this.
 *
 * Returns undefined rather than zeroes when a read is missing: zero amounts would describe an empty
 * position, which is a different claim from not knowing yet.
 */
export function useV2Underlying(pair: `0x${string}`, balance: bigint): V2Underlying | undefined {
  const {data, isError} = useReadContracts({
    contracts: [
      {address: pair, abi: v2PairAbi, functionName: 'getReserves'},
      {address: pair, abi: erc20Abi, functionName: 'totalSupply'},
      {address: pair, abi: v2PairAbi, functionName: 'token0'},
      {address: pair, abi: v2PairAbi, functionName: 'token1'},
    ],
    // Reserves move with every trade against the pair, so the composition is polled alongside the
    // USD value it sits under rather than being pinned to the moment the page mounted.
    query: {enabled: balance > 0n, refetchInterval: LIVE_REFETCH_MS},
  });

  // `enabled: false` stops the query, it does not evict what it already fetched, and none of the
  // four reads take the balance as an argument — so the cache key is the same at zero and the
  // reserves are still there after a deposit empties the wallet. Multiplying them by a zero balance
  // yields a truthy `0 WETH / 0 USDC`, printed under a USD figure that correctly reads "—".
  if (balance === 0n) return undefined;

  // A failed refetch leaves the last successful reserves cached, and reserves are what turn the
  // balance into amounts — serving them as current would state a composition the pair has moved on
  // from. Per-call failures land as an undefined result and are caught by the checks below.
  if (isError) return undefined;
  const reserves = data?.[0].result;
  const totalSupply = data?.[1].result;
  const token0 = data?.[2].result;
  const token1 = data?.[3].result;
  if (reserves === undefined || totalSupply === undefined || !token0 || !token1) return undefined;
  // The divisor, read from the pair rather than derived here. A supply of zero contradicts the
  // non-zero balance checked above, so it means the two reads landed on different states.
  if (totalSupply === 0n) return undefined;

  return {
    token0,
    token1,
    amount0: (balance * reserves[0]) / totalSupply,
    amount1: (balance * reserves[1]) / totalSupply,
  };
}
