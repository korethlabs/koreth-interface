'use client';

import {useMemo} from 'react';
import {useReadContracts} from 'wagmi';
import {deployments} from '@/generated/deployments';
import {protocolCoreAbi} from '@/generated/abis';
import {useCollateralPools} from './useSubgraph';
import {v2PairAbi} from '@/lib/v2';

/** One accepted pool, identified by what it holds rather than by its address alone. */
export interface AcceptedPool {
  address: `0x${string}`;
  token0: `0x${string}`;
  token1: `0x${string}`;
  /** Fee tier in hundredths of a bip, for V3 pools only. A V2 pair has no such thing. */
  fee?: number;
}

export interface AcceptedCollateral {
  v2: AcceptedPool[];
  v3: AcceptedPool[];
}

export interface AcceptedCollateralResult {
  /** The accepted set, or `undefined` while it is unknown. */
  data: AcceptedCollateral | undefined;
  isLoading: boolean;
  isError: boolean;
}

/**
 * `fee()` exists on a Uniswap V3 pool and on no V2 pair, which makes it the discriminator between
 * the two. A revert here is the answer, not a failure — hence `allowFailure` below.
 */
const v3PoolAbi = [
  {type: 'function', name: 'fee', stateMutability: 'view', inputs: [], outputs: [{type: 'uint24'}]},
] as const;

const READS_PER_POOL = 4;

/**
 * Which collateral the protocol accepts, split by DEX version.
 *
 * The subgraph enumerates and the chain adjudicates. That division is not arbitrary: the index is
 * the only thing that can list `supportedLpPools` at all, since it is a mapping, but it answers as
 * of whatever block it has reached — and a deposit is settled against the current one. So the
 * addresses come from the index, and everything decided from them is read here:
 *
 *  - which version a pool belongs to, and which two tokens it holds, so the labels and the balances
 *    are the pool's own rather than a guess keyed off its address;
 *  - `isLpPoolSupported`, re-asked per pool. If the index has not yet caught a delisting, offering
 *    the pool would send a deposit that reverts LP_POOL_NOT_SUPPORTED and charge the user gas to
 *    discover it.
 *
 * `data` is `undefined` whenever the answer is unknown, and `isLoading`/`isError` say which kind of
 * unknown it is. A shortened list is indistinguishable from a protocol that accepts less, and it
 * would be shown with no indication that anything went wrong, so nothing is dropped quietly: a read
 * that fails fails the whole hook, and the callers render an explicit "could not be listed" rather
 * than a shorter menu or a guess. The one failure that is not a failure is `fee()` reverting.
 */
export function useAcceptedCollateral(): AcceptedCollateralResult {
  const {data: pools, isError: poolsError} = useCollateralPools();
  const addresses = useMemo(
    () => (pools ?? []).map((p) => p.address as `0x${string}`),
    [pools],
  );

  const {data, isError} = useReadContracts({
    // Four reads per pool, kept in this order so the results can be sliced by index below.
    allowFailure: true,
    contracts: addresses.flatMap((address) => [
      {address, abi: v3PoolAbi, functionName: 'fee' as const},
      {address, abi: v2PairAbi, functionName: 'token0' as const},
      {address, abi: v2PairAbi, functionName: 'token1' as const},
      {
        address: deployments.core,
        abi: protocolCoreAbi,
        functionName: 'isLpPoolSupported' as const,
        args: [address] as const,
      },
    ]),
    query: {enabled: addresses.length > 0},
  });

  return useMemo(() => {
    if (poolsError) return {data: undefined, isLoading: false, isError: true};
    if (pools === undefined) return {data: undefined, isLoading: true, isError: false};
    // A whitelist that is genuinely empty is a real answer, and a different one from not knowing.
    if (addresses.length === 0) return {data: {v2: [], v3: []}, isLoading: false, isError: false};
    if (isError) return {data: undefined, isLoading: false, isError: true};
    if (data === undefined) return {data: undefined, isLoading: true, isError: false};
    // The loop below reads the results positionally, four per pool. If that arithmetic ever stops
    // holding — a read added to the batch without READS_PER_POOL following it — every pool would be
    // classified off someone else's results, which is silently wrong rather than visibly broken.
    if (data.length !== addresses.length * READS_PER_POOL) {
      return {data: undefined, isLoading: false, isError: true};
    }

    const v2: AcceptedPool[] = [];
    const v3: AcceptedPool[] = [];
    for (let i = 0; i < addresses.length; i++) {
      const [feeRead, token0Read, token1Read, supportedRead] = data.slice(
        i * READS_PER_POOL,
        (i + 1) * READS_PER_POOL,
      );
      // A pool whose tokens or current standing could not be read cannot be classified, and
      // dropping it alone would quietly narrow the protocol. Fail the whole hook instead.
      if (
        token0Read.status === 'failure' ||
        token1Read.status === 'failure' ||
        supportedRead.status === 'failure'
      ) {
        return {data: undefined, isLoading: false, isError: true};
      }
      // Not an error: the chain has the last word on the set, and this pool is no longer in it.
      if (supportedRead.result !== true) continue;

      const pool: AcceptedPool = {
        address: addresses[i],
        token0: token0Read.result as `0x${string}`,
        token1: token1Read.result as `0x${string}`,
      };
      if (feeRead.status === 'success') {
        v3.push({...pool, fee: Number(feeRead.result)});
      } else {
        v2.push(pool);
      }
    }
    return {data: {v2, v3}, isLoading: false, isError: false};
  }, [pools, poolsError, addresses, data, isError]);
}

/**
 * Whether a V3 NFT sits in a pool the protocol accepts.
 *
 * Matched on the pair and fee tier rather than by resolving the pool address through the factory.
 * Uniswap derives a pool's address from exactly that triple and a pool reports back the triple it
 * was created with, so the two tests are the same test — and this one needs no extra call, because
 * the accepted pools' tokens and fees have already been read.
 */
export function isAcceptedV3Position(
  accepted: AcceptedPool[],
  token0: string,
  token1: string,
  fee: number,
): boolean {
  const a = token0.toLowerCase();
  const b = token1.toLowerCase();
  return accepted.some(
    (p) => p.fee === fee && p.token0.toLowerCase() === a && p.token1.toLowerCase() === b,
  );
}

/** "WETH/USDC", from the pool's own tokens. */
export function pairLabel(pool: AcceptedPool, symbolOf: (address: string) => string): string {
  return `${symbolOf(pool.token0)}/${symbolOf(pool.token1)}`;
}
