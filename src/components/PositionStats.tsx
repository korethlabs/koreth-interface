import {formatUnits} from 'viem';
import {
  LIQUIDATION_HEALTH_FACTOR,
  NO_DEBT_HEALTH_FACTOR,
  liquidationDropBps,
} from '@/hooks/useCollateralConfig';
import {formatAprBps} from '@/hooks/useLendingPool';
import {isOpenOnChain} from '@/hooks/useOnChainPosition';
import {type PositionSummary} from '@/hooks/usePositionSummary';
import {UsdValue} from '@/components/UsdValue';

// ∞ is reserved for the debt-free sentinel itself, so it cannot be read as "no debt" by a position
// carrying a dust balance against whole collateral, whose factor is merely enormous. Those are
// capped instead: past a certain point the digits stop distinguishing anything.
function formatHealth(hf: bigint | undefined): string {
  if (hf === undefined) return '—';
  if (hf === NO_DEBT_HEALTH_FACTOR) return '∞';
  if (hf > 1_000n * 10n ** 18n) return '> 1000';
  return Number(formatUnits(hf, 18)).toFixed(2);
}

/**
 * The health factor restated as the fall in the LP that would reach the liquidation line, which is
 * the form of it a borrower can act on. Kept beside the factor rather than replacing it: the ratio
 * is the figure the protocol and every other interface speak in.
 */
function formatLiquidationDistance(hf: bigint | undefined): string {
  if (hf === undefined) return '—';
  const drop = liquidationDropBps(hf);
  if (drop === undefined) return 'No debt to liquidate';
  // The two exact cases are decided on the factor itself rather than on the rounded distance, which
  // cannot tell them apart. isLiquidatable clears a position at exactly 1.00, so the boundary is
  // not yet executable, and saying a liquidation can be called where it would revert is the kind of
  // claim this page is being made not to make.
  if (hf < LIQUIDATION_HEALTH_FACTOR) return 'Liquidatable now';
  if (hf === LIQUIDATION_HEALTH_FACTOR) return 'Liquidated by any further LP fall';
  // Below a tenth of a percent the figure has to be described rather than printed: truncating it
  // would render a real distance as `0.0%`, which reads as no fall being needed at all — the very
  // claim the line above exists to reserve for the position that is actually on the line.
  if (drop < 10n) return 'Liquidated by a fall of under 0.1%';
  // Truncated rather than rounded to the nearest tenth, for the same reason the bps figure is:
  // rounding 13.36% up to 13.4% would name a fall the position in fact survives, and the number is
  // being read as the point at which the collateral is taken. "Over" rather than "at" for the same
  // reason at the other end — isLiquidatable needs the factor strictly below 1.00, so a fall of
  // exactly the distance shown still clears, and a truncated figure is in any case a lower bound.
  return `Liquidated by a fall of over ${(Number(drop / 10n) / 10).toFixed(1)}%`;
}

function healthColor(hf: bigint | undefined): string {
  if (hf === undefined || hf === NO_DEBT_HEALTH_FACTOR) return 'text-[var(--accent)]';
  const v = Number(formatUnits(hf, 18));
  if (v < 1.1) return 'text-[var(--danger)]';
  if (v < 1.5) return 'text-[var(--warning)]';
  return 'text-[var(--accent)]';
}

/**
 * The position's risk, in the two forms it is worth stating: the ratio the protocol liquidates on,
 * and the fall in the collateral that would reach it.
 *
 * Shared so that a position cannot be described as safe on one page and near the line on the other.
 * `/portfolio` previously printed the bare factor with no distance beside it, which asks the user
 * to do the arithmetic that turns 1.13 into "a 12% fall takes your collateral" — on the page where
 * they are deciding whether to repay.
 */
export function HealthReadout({
  current,
  projected,
}: {
  current: bigint | undefined;
  /**
   * The factor a transaction being prepared would leave the position at. Wrapped rather than passed
   * bare so that "nothing is being prepared" and "something is, and its consequence could not be
   * computed" stay distinguishable: the second must not fall back to the current figure, which is
   * real but answers the question the user stopped asking as soon as they typed an amount — and
   * always reads safer than the one they are about to accept.
   */
  projected?: {value: bigint | undefined};
}) {
  const after = projected?.value;
  return (
    <div className="text-right">
      <p className="text-xs text-[var(--muted)]">Health</p>
      {/* The projected value sits next to the current one rather than replacing it: the question
          being asked is how much this borrow moves the number, which a single figure cannot
          answer. */}
      <p className="text-xl font-semibold tabular-nums leading-tight">
        <span className={healthColor(current)}>{formatHealth(current)}</span>
        {after !== undefined && (
          <>
            <span className="text-[var(--muted)]"> → </span>
            <span className={healthColor(after)}>{formatHealth(after)}</span>
          </>
        )}
      </p>
      {/* Describes whichever factor the figure above ends on, so the sentence and the number are
          never about different positions. */}
      <p className="text-xs text-[var(--muted)]">
        {formatLiquidationDistance(projected === undefined ? current : after)}
      </p>
    </div>
  );
}

/**
 * What the position holds, owes, pays and can still draw.
 *
 * `Available` is the last of those and the reason this grid is shared: it is capacity net of the
 * debt already drawn and net of the cash the pool has left, which is the only one of the several
 * capacity-shaped numbers a user can act on. `/portfolio` used to show raw getMaxBorrow under the
 * name `Max borrow` — a larger figure, with the existing debt still counted inside it, that a user
 * reading both pages had no way to reconcile with the smaller one called `Available`.
 */
export function PositionStats({
  summary,
  symbol,
  decimals,
}: {
  summary: PositionSummary;
  symbol: string;
  decimals: number;
}) {
  const {collateral, debt, market, available, position} = summary;
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 text-sm border-y border-[var(--border)] py-3">
      <Cell
        label="Collateral"
        value={
          // Priced live, from the same call the health factor divides by. The subgraph's
          // deposit-time figure would sit next to a health factor that had already moved. A closed
          // position has had its LP returned and getPositionValue would still price it, so the
          // status gating this comes from the position record itself, not from the index behind it.
          isOpenOnChain(position) ? (
            <UsdValue {...collateral} approx={false} maximumFractionDigits={0} />
          ) : (
            '—'
          )
        }
      />
      <Cell
        label="Debt"
        value={debt === undefined ? '—' : `${fmt(Number(formatUnits(debt, decimals)))} ${symbol}`}
      />
      {/* The price of the loan, on the screen where the amount is chosen as well as on the one
          where the debt is managed. It moves with the pool's utilization, so a borrow by someone
          else changes what this one costs. */}
      <Cell
        label="Borrow APR"
        value={formatAprBps(market?.borrowAprBps)}
      />
      <Cell
        label="Available"
        value={
          available === undefined ? '—' : `${fmt(Number(formatUnits(available, decimals)))} ${symbol}`
        }
      />
    </div>
  );
}

function fmt(n: number): string {
  return n.toLocaleString('en-US', {maximumFractionDigits: 2});
}

function Cell({label, value}: {label: string; value: React.ReactNode}) {
  return (
    <div>
      <p className="text-[var(--muted)] text-xs">{label}</p>
      <p className="tabular-nums">{value}</p>
    </div>
  );
}
