'use client';

import {useReadContract} from 'wagmi';
import {deployments} from '@/generated/deployments';
import {circuitBreakerAbi, positionManagerAbi} from '@/generated/abis';
import {LIVE_REFETCH_MS} from '@/lib/chain';

/**
 * The CircuitBreaker the protocol is actually consulting, and whether that could be established.
 *
 * Resolved through `PositionManager.getCircuitBreaker()` rather than from a generated address, for
 * the same reason `useRiskManager` goes through ProtocolCore: that call is what deposit() and
 * borrow() themselves use to find the breaker, so a separately configured address would let the app
 * read halt state from a breaker the contracts had already stopped obeying. It also needs no new
 * deployment key.
 *
 * `getCircuitBreaker()` reverts CIRCUIT_BREAKER_UNSET when the breaker was never wired, so an
 * unwired deployment arrives here as `isError` rather than as the zero address — which is the
 * honest shape, since a protocol whose halt switch cannot be located is not one whose pools can be
 * declared safe to deposit into.
 */
export function useCircuitBreaker(): {address: `0x${string}` | undefined; isError: boolean} {
  // Polled alongside the state it addresses: setCircuitBreaker can repoint the protocol while the
  // page is open, and a cached address would keep the pages reading halt state from a breaker the
  // contracts no longer consult.
  const {data, isError} = useReadContract({
    address: deployments.positionManager,
    abi: positionManagerAbi,
    functionName: 'getCircuitBreaker',
    query: {refetchInterval: LIVE_REFETCH_MS},
  });
  return {address: isError ? undefined : (data as `0x${string}` | undefined), isError};
}

/**
 * Whether the breaker has frozen a collateral type, or `undefined` when that is not known.
 *
 * deposit() and borrow() both require `!collateralFrozen(lpType)`, so a frozen type turns every
 * deposit of it into a revert the user pays gas to discover. Freezing is the Aave-style halt: it
 * blocks new risk and deliberately leaves withdraw, repay and liquidate open, which is why the
 * screens that report it say so rather than implying the position is stuck.
 *
 * Unknown fails closed, and unknown covers both a breaker that could not be located and a read that
 * failed. A guardian can throw this switch at any moment, so the cached `false` from before one is
 * exactly the answer least worth serving — the same reasoning `useCollateralConfig` applies to
 * `enabled` and `useProtocolPaused` applies to the global pause.
 */
export function useCollateralFrozen(lpType: number | undefined): boolean | undefined {
  const breaker = useCircuitBreaker();
  const {data, isError} = useReadContract({
    address: breaker.address,
    abi: circuitBreakerAbi,
    functionName: 'collateralFrozen',
    args: lpType === undefined ? undefined : [lpType],
    query: {enabled: !!breaker.address && lpType !== undefined, refetchInterval: LIVE_REFETCH_MS},
  });
  if (breaker.isError || isError) return undefined;
  return data as boolean | undefined;
}
