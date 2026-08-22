'use client';

import {useReadContract} from 'wagmi';
import {deployments} from '@/generated/deployments';
import {positionManagerAbi} from '@/generated/abis';
import {tokenInfo} from '@/lib/tokens';

/** The fields of PositionManager's Position struct this app reads. */
export type OnChainPosition = {
  lpToken: `0x${string}`;
  tokenId: bigint;
  amount: bigint;
  lpType: number;
  token0: `0x${string}`;
  token1: `0x${string}`;
  depositBlock: bigint;
};

/** ILPAdapter.LPType, the discriminator LPOracleHub routes on to pick the per-protocol oracle. */
export const LP_TYPE_V2 = 0;
export const LP_TYPE_V3 = 1;

/**
 * The stored position, which is where the pair, the LP type and the deposit block come from.
 *
 * Preferred over the subgraph's copy for anything that decides what the user is shown about their
 * collateral: the subgraph re-derives the LP type into a display string and can be several blocks
 * behind, while this is the record the protocol itself acts on.
 */
export function useOnChainPosition(positionId: bigint): OnChainPosition | undefined {
  const {data} = useReadContract({
    address: deployments.positionManager,
    abi: positionManagerAbi,
    functionName: 'getPosition',
    args: [positionId],
  });
  return data as OnChainPosition | undefined;
}

/**
 * A name for a position: the pair it holds, plus the NFT id for V3 so two positions in the same
 * pair are distinguishable. Falls back to the sequential id while the read is in flight, which is
 * all the page had before.
 */
export function positionTitle(position: OnChainPosition | undefined, positionId: string): string {
  if (!position) return `Position #${positionId}`;
  const pair = `${tokenInfo(position.token0).symbol}/${tokenInfo(position.token1).symbol}`;
  return position.lpType === LP_TYPE_V3 ? `${pair} · V3 #${position.tokenId.toString()}` : `${pair} · V2`;
}
