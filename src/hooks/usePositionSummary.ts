'use client';

import {useReadContract} from 'wagmi';
import {deployments} from '@/generated/deployments';
import {lendingEngineAbi, positionManagerAbi} from '@/generated/abis';
import {useCollateralConfig, type CollateralConfig} from '@/hooks/useCollateralConfig';
import {useOnChainPosition, type OnChainPosition} from '@/hooks/useOnChainPosition';
import {usePoolMarket, type PoolMarket} from '@/hooks/useLendingPool';
import {usePositionValue, type PositionValue} from '@/hooks/usePositionValue';
import {LIVE_REFETCH_MS} from '@/lib/chain';

/**
 * Share of a position's borrowing capacity, and of a pool's cash, the interface offers. See
 * `fromCapacity` and `liquidityCap` below for why each is held back — the reasons are unrelated,
 * and it is coincidence rather than design that the same fraction answers both.
 */
export const BORROW_HEADROOM_BPS = 9_900n;

/**
 * One borrowing position as both pages describe it.
 *
 * `/borrow` and `/portfolio` show the same position either side of the same decision, and until
 * this hook existed they each derived it from the same contracts in their own words: one card
 * headlined `Available` — capacity net of debt and net of the pool's cash — while the other
 * headlined `Max borrow`, the raw capacity with the debt still inside it. Two names a user has no
 * way to tell apart, over two numbers that genuinely differ, on two views of one position. The
 * arithmetic that resolves them belongs in one place, not in whichever card was edited last.
 */
export type PositionSummary = {
  /** Collateral value in USD, priced as getHealthFactor prices it. */
  collateral: PositionValue;
  /** Debt in the borrow asset, accrued to the last block read. */
  debt: bigint | undefined;
  /** The position's health factor, as getHealthFactor reports it. */
  healthFactor: bigint | undefined;
  /** getMaxBorrow: total capacity, which the existing debt is drawn against rather than added to. */
  capacity: bigint | undefined;
  /** The stored position record — the protocol's own copy of status, LP type and deposit block. */
  position: OnChainPosition | undefined;
  /** Risk parameters for this position's collateral type. */
  config: CollateralConfig | undefined;
  /** The pool this position borrows from: its rate and the cash it has left. */
  market: PoolMarket | undefined;
  /** What the collateral still supports, after debt and after the headroom. */
  fromCapacity: bigint | undefined;
  /** What the pool can fund, after the headroom. */
  liquidityCap: bigint | undefined;
  /** The lesser of the two, and the only figure either page should call borrowable. */
  available: bigint | undefined;
  /** True when the pool's cash, not the collateral, is what limits the next borrow. */
  liquidityBound: boolean;
  /**
   * Re-reads what a transaction on this position moves: the debt, the health factor, the capacity,
   * the stored position record and the pool.
   *
   * Not the collateral value, and not the risk config. No action either page offers changes the
   * first — a borrow and a repayment leave the LP exactly where it is — and the one that does
   * return it, withdraw(), is caught by the position record, which the collateral cell is gated on
   * and which this does re-read. The config is an admin's to change, never the caller's. Both are
   * polled on the same interval as everything else regardless, so neither can drift for longer than
   * any other figure here; they are omitted because refetching them would be answering a question
   * the confirmed transaction did not ask.
   */
  refetch: () => void;
};

export function usePositionSummary(
  positionId: bigint,
  pool: `0x${string}`,
  borrowAsset: `0x${string}`,
): PositionSummary {
  // Polled: debt accrues every block, and both the health factor and the capacity are re-derived
  // from the LP price, so a card left open would go on describing a position the chain has moved
  // past.
  const live = {refetchInterval: LIVE_REFETCH_MS} as const;
  const {data: debt, isError: debtError, refetch: refetchDebt} = useReadContract({
    address: deployments.lendingEngine,
    abi: lendingEngineAbi,
    functionName: 'getDebt',
    args: [positionId],
    query: live,
  });
  const {data: health, isError: healthError, refetch: refetchHealth} = useReadContract({
    address: deployments.positionManager,
    abi: positionManagerAbi,
    functionName: 'getHealthFactor',
    args: [positionId],
    query: live,
  });
  const {data: maxBorrow, isError: maxBorrowError, refetch: refetchMax} = useReadContract({
    address: deployments.lendingEngine,
    abi: lendingEngineAbi,
    functionName: 'getMaxBorrow',
    args: [positionId],
    query: live,
  });
  const collateral = usePositionValue(positionId);
  // The LP type comes off the position itself rather than from the subgraph's label, so the risk
  // parameters shown are keyed to what the protocol recorded rather than to a name match.
  const {position, refetch: refetchPosition} = useOnChainPosition(positionId);
  const config = useCollateralConfig(position?.lpType);
  const market = usePoolMarket(pool, borrowAsset);

  // A read in error counts as missing rather than as its last successful answer, which TanStack
  // Query keeps cached: a debt that stopped updating is the input the headroom below is most
  // sensitive to, and a zero standing in for it reads as a position with nothing drawn.
  const debtRaw = debtError ? undefined : (debt as bigint | undefined);
  const capacityRaw = maxBorrowError ? undefined : (maxBorrow as bigint | undefined);

  // getMaxBorrow is the position's total borrowing capacity, not what is left to draw: borrow()
  // checks `currentDebt + amount <= maxBorrow`, so existing debt has to come off it first. Both
  // reads have to be in before that subtraction means anything — treating a debt still in flight
  // as zero would offer the whole capacity to a position that has already drawn most of it.
  //
  // borrow() then re-derives both sides at execution: it accrues interest first, so the debt is
  // larger than the one read here, and it re-prices the LP through the oracle, so the capacity may
  // be smaller. Offering the exact headroom therefore reverts EXCEEDS_MAX_LTV whenever either
  // moves between the read and the block that mines the borrow. Aave's interface holds back the
  // same 1% of its max borrow, for the same reason.
  //
  // The 1% comes off the capacity before the debt rather than off what is left after it. Both
  // things it absorbs — accrued interest and a fall in the LP price — are sized by the position,
  // not by its remaining headroom, so taking the cut afterwards would shrink the buffer to nothing
  // exactly where it is needed: a position already near its limit. Clamped at zero, since 99% of
  // capacity can be below a debt that has accrued past it.
  const drawable = capacityRaw === undefined ? undefined : (capacityRaw * BORROW_HEADROOM_BPS) / 10_000n;
  const fromCapacity =
    debtRaw === undefined || drawable === undefined ? undefined : drawable > debtRaw ? drawable - debtRaw : 0n;
  // The second bound, and the one the LTV arithmetic above knows nothing about: borrow() ends in
  // pool.transferOut, which requires the amount to be at most the borrow asset actually held by the
  // pool. A position with capacity to spare in a pool whose cash borrowers have already taken
  // reverts INSUFFICIENT_LIQUIDITY, so offering the LTV headroom alone advertises a loan the pool
  // cannot fund. Held back by the same 1% as the capacity, for a different reason: the cash can be
  // drawn down by a borrow in an earlier block.
  const liquidityCap =
    market === undefined ? undefined : (market.liquidity * BORROW_HEADROOM_BPS) / 10_000n;
  const available =
    fromCapacity === undefined || liquidityCap === undefined
      ? undefined
      : fromCapacity < liquidityCap
        ? fromCapacity
        : liquidityCap;
  // Which of the two bounds is binding. They are the same greyed-out button and entirely different
  // situations: one is undone by repaying or depositing, the other only by someone else repaying.
  // Ties count as capacity-bound, since that is the side the user can act on.
  const liquidityBound = fromCapacity !== undefined && liquidityCap !== undefined && liquidityCap < fromCapacity;

  return {
    collateral,
    debt: debtRaw,
    healthFactor: healthError ? undefined : (health as bigint | undefined),
    capacity: capacityRaw,
    position,
    config,
    market,
    fromCapacity,
    liquidityCap,
    available,
    liquidityBound,
    refetch: () => {
      refetchDebt();
      refetchHealth();
      refetchMax();
      // Includes the position record: withdraw() closes it, and the collateral cell gates on that
      // status rather than on the subgraph's.
      refetchPosition();
      // Every action on either page moves cash into or out of the pool and with it the utilization,
      // so the bound on the next borrow and the rate this debt pays are both stale until this lands.
      market?.refetch();
    },
  };
}
