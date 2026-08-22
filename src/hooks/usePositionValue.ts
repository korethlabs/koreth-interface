'use client';

import {useReadContract, useReadContracts} from 'wagmi';
import {deployments} from '@/generated/deployments';
import {positionManagerAbi} from '@/generated/abis';
import {LIVE_REFETCH_MS} from '@/lib/chain';

export type PositionValue = {value: bigint | undefined; isError: boolean};

const NO_VALUE: PositionValue = {value: undefined, isError: false};

/**
 * The collateral's USD value as the protocol prices it right now.
 *
 * The subgraph's `depositValue` is written once when the position is opened and only ever
 * decremented on liquidation, so it drifts from the health factor shown next to it as soon as the
 * market moves — a position can read "$23,000 of collateral" while its health factor says it is
 * about to be liquidated. getPositionValue is the same figure getHealthFactor divides by, so the
 * two numbers on screen come from one source and cannot contradict each other.
 */
export function usePositionValue(positionId: bigint): PositionValue {
  const {data, isError} = useReadContract({
    address: deployments.positionManager,
    abi: positionManagerAbi,
    functionName: 'getPositionValue',
    args: [positionId],
    query: {refetchInterval: LIVE_REFETCH_MS},
  });
  return {value: data as bigint | undefined, isError};
}

/**
 * Batched form for lists: one multicall for the whole table rather than a read per row.
 * Returns a lookup by position id rather than by index, so a caller that sorts or filters its
 * rows after calling this can't silently pair a value with the wrong position.
 */
export function usePositionValues(positionIds: bigint[]): (positionId: bigint | string) => PositionValue {
  const {data, isError} = useReadContracts({
    contracts: positionIds.map((id) => ({
      address: deployments.positionManager,
      abi: positionManagerAbi,
      functionName: 'getPositionValue' as const,
      args: [id] as const,
    })),
    query: {enabled: positionIds.length > 0, refetchInterval: LIVE_REFETCH_MS},
  });

  // Two ways a value can be missing, and they have to be told apart: a per-call `failure` is one
  // oracle that reverted, while `isError` is the multicall itself never landing. Reading only the
  // per-call status would leave the whole table looking like it was still loading after the
  // transport gave up, so every row would render "—" forever instead of saying the price is
  // unavailable.
  const byId = new Map<string, PositionValue>(
    positionIds.map((id, i) => [
      id.toString(),
      {value: data?.[i]?.result as bigint | undefined, isError: isError || data?.[i]?.status === 'failure'},
    ]),
  );
  return (positionId) => byId.get(positionId.toString()) ?? NO_VALUE;
}
