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
export function useCollateralConfig(lpType: number | undefined): CollateralConfig | undefined {
  const riskManager = useRiskManager();
  const {data} = useReadContract({
    address: riskManager,
    abi: riskManagerAbi,
    functionName: 'getCollateralConfig',
    args: lpType === undefined ? undefined : [lpType],
    query: {enabled: !!riskManager && lpType !== undefined},
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
  // A suspended collateral type has no capacity to report: deposit() requires `enabled`, so the
  // haircut-and-LTV figure would advertise a borrow the deposit itself would revert on.
  if (!config.enabled) return undefined;
  const discounted = (collateralUsd * (BPS - config.haircut)) / BPS;
  return (discounted * config.maxLtv) / BPS;
}

/**
 * The health factor a position would have carrying `totalDebt` of its borrow asset.
 *
 * Derived from getMaxBorrow rather than by converting the debt to USD, which would mean a second
 * price feed read and a second chance to disagree with the contracts. Both sides of the contract's
 * formula share the same collateral value and the same USD conversion, and both are linear in the
 * amount, so those factors cancel:
 *
 *   getHealthFactor  = collateralAfterHaircut × liquidationThreshold / debtUsd
 *   getMaxBorrow     = collateralAfterHaircut × maxLtv / borrowAssetPrice
 *   debtUsd          = totalDebt × borrowAssetPrice
 *
 *   ⇒ healthFactor   = (liquidationThreshold / maxLtv) × (maxBorrow / totalDebt)
 *
 * which needs only figures this page has already read. Debt-free positions return undefined:
 * getHealthFactor answers uint256.max there, and dividing by zero debt has no meaning.
 *
 * Both inputs are optional on purpose. getMaxBorrow reverts when the oracle is down, and a debt
 * read can still be in flight — coalescing either to zero turns a missing read into a health
 * factor of 0.00, or into a reassuring one that understates the risk of a position that does
 * carry debt.
 */
export function projectedHealthFactor(
  totalDebt: bigint | undefined,
  maxBorrow: bigint | undefined,
  config: CollateralConfig | undefined,
): bigint | undefined {
  if (config === undefined || maxBorrow === undefined || totalDebt === undefined) return undefined;
  if (config.maxLtv === 0n || totalDebt === 0n) return undefined;
  return (config.liquidationThreshold * maxBorrow * 10n ** 18n) / (config.maxLtv * totalDebt);
}
