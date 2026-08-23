'use client';

import {useReadContract} from 'wagmi';
import {deployments} from '@/generated/deployments';
import {protocolCoreAbi, riskManagerAbi} from '@/generated/abis';
import {LIVE_REFETCH_MS} from '@/lib/chain';

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
  // Polled alongside the config it addresses: core.setRiskManager can point the protocol at a new
  // manager while the page is open, and a cached address would keep the cards reading parameters
  // from one the contracts have stopped consulting — the drift this indirection exists to avoid.
  const {data, isError} = useReadContract({
    address: deployments.core,
    abi: protocolCoreAbi,
    functionName: 'riskManagerAddr',
    query: {refetchInterval: LIVE_REFETCH_MS},
  });
  return isError ? undefined : (data as `0x${string}` | undefined);
}

/** Risk parameters for one collateral type, or undefined until they have been read. */
export function useCollateralConfig(lpType: number | undefined): CollateralConfig | undefined {
  const riskManager = useRiskManager();
  const {data, isError} = useReadContract({
    address: riskManager,
    abi: riskManagerAbi,
    functionName: 'getCollateralConfig',
    args: lpType === undefined ? undefined : [lpType],
    // Polled because `enabled` is a switch an admin can throw while the page is open: without it a
    // card that loaded before a suspension keeps offering a deposit the protocol now refuses.
    query: {enabled: !!riskManager && lpType !== undefined, refetchInterval: LIVE_REFETCH_MS},
  });
  // A failed refetch leaves the last successful config cached, and `enabled` is the flag the
  // deposit and borrow buttons are gated on: serving a stale `true` is how a suspended collateral
  // type keeps being offered. Unknown is the honest answer, and it fails closed.
  return isError ? undefined : (data as CollateralConfig | undefined);
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

/** The health factor of a debt-free position, as getHealthFactor reports it. */
export const NO_DEBT_HEALTH_FACTOR = 2n ** 256n - 1n;

/** Health factor at which a position becomes liquidatable — strictly below, as isLiquidatable checks. */
export const LIQUIDATION_HEALTH_FACTOR = 10n ** 18n;

/**
 * How far the collateral can fall before the position becomes liquidatable, in bps of its current
 * value.
 *
 * getHealthFactor divides the haircut collateral value by the debt, and the debt does not move with
 * the LP price, so the factor is linear in that value: multiplying the collateral by `1/hf` lands
 * exactly on 1.00. This is the same fact the health factor states, expressed in the quantity the
 * borrower is actually exposed to — a factor of 1.15 and "a 13% fall liquidates you" are the same
 * sentence, and only one of them can be acted on without doing arithmetic first.
 *
 * Undefined for a position with no debt, which getHealthFactor answers as exactly uint256.max:
 * there is no price at which it can be liquidated, which is different from a fall of zero. Matched
 * exactly rather than by an "implausibly large" cutoff, which a real position carrying dust debt
 * against whole collateral can exceed — and would then be described as having nothing to liquidate.
 */
export function liquidationDropBps(hf: bigint | undefined): bigint | undefined {
  if (hf === undefined) return undefined;
  if (hf === NO_DEBT_HEALTH_FACTOR) return undefined;
  // At or past the line already: no fall is needed, rather than a negative distance. isLiquidatable
  // clears at exactly 1.00, so this zero covers both a position already under and one standing on
  // the threshold; the two are distinguished by the caller, which still has the factor itself.
  if (hf <= LIQUIDATION_HEALTH_FACTOR) return 0n;
  // Rounded down, which is the direction that keeps the answer safe to act on: the surviving
  // fraction is rounded up instead, so the fall reported is at most the one that actually reaches
  // the line. Rounding a distance up would tell a borrower they still have room they do not have.
  const survives = (BPS * LIQUIDATION_HEALTH_FACTOR + hf - 1n) / hf;
  return survives >= BPS ? 0n : BPS - survives;
}
