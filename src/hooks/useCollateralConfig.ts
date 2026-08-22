'use client';

import {useReadContract} from 'wagmi';
import {deployments} from '@/generated/deployments';
import {protocolCoreAbi, riskManagerAbi} from '@/generated/abis';

export type CollateralConfig = {
  maxLtv: bigint;
  liquidationThreshold: bigint;
  liquidationBonus: bigint;
  haircut: bigint;
  borrowCap: bigint;
  enabled: boolean;
};

const BPS = 10_000n;

/**
 * The RiskManager the protocol is actually consulting.
 *
 * Resolved through ProtocolCore rather than read from deployments.json because that is where
 * LendingEngine and PositionManager look it up on every borrow and health-factor call
 * (`core.riskManagerAddr()`). A separately configured address in the frontend would keep
 * rendering risk parameters from a RiskManager the contracts had already stopped using.
 */
export function useRiskManager(): `0x${string}` | undefined {
  const {data} = useReadContract({address: deployments.core, abi: protocolCoreAbi, functionName: 'riskManagerAddr'});
  return data as `0x${string}` | undefined;
}

/** Risk parameters for one collateral type, or undefined until they have been read. */
export function useCollateralConfig(lpType: number): CollateralConfig | undefined {
  const riskManager = useRiskManager();
  const {data} = useReadContract({
    address: riskManager,
    abi: riskManagerAbi,
    functionName: 'getCollateralConfig',
    args: [lpType],
    query: {enabled: !!riskManager},
  });
  return data as CollateralConfig | undefined;
}

/**
 * How much debt a given amount of collateral would support, mirroring LendingEngine._getMaxBorrow:
 * the haircut discounts the oracle value, then maxLtv caps the borrow against what is left.
 *
 * Returns undefined rather than zero when either input is missing. Zero is a real answer here —
 * it is what a disabled collateral type is worth — so standing in for an unread config would
 * report a suspended market as one that simply lends nothing against this LP.
 */
export function borrowingCapacityUsd(
  collateralUsd: bigint | undefined,
  config: CollateralConfig | undefined,
): bigint | undefined {
  if (collateralUsd === undefined || config === undefined) return undefined;
  const discounted = (collateralUsd * (BPS - config.haircut)) / BPS;
  return (discounted * config.maxLtv) / BPS;
}
