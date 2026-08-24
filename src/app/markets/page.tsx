'use client';

import {formatUnits} from 'viem';
import {useSubgraphPools, useCollateralTypes} from '@/hooks/useSubgraph';
import {formatAprBps, usePoolMarket} from '@/hooks/useLendingPool';
import type {SubgraphPool, SubgraphCollateralType} from '@/lib/subgraph';

function bpsPct(bps: string, digits = 0): string {
  return `${(Number(bps) / 100).toFixed(digits)}%`;
}

const POOL_COLUMNS = 7;
const COLLATERAL_COLUMNS = 6;

export default function MarketsPage() {
  const {data: pools, isError: poolsError} = useSubgraphPools();
  const {data: collateralTypes, isError: collateralError} = useCollateralTypes();

  return (
    <main className="min-h-screen p-8">
      <div className="max-w-5xl mx-auto space-y-10">
        <div>
          <h1 className="text-3xl font-bold">Markets</h1>
          <p className="mt-2 text-[var(--muted-strong)]">
            Every collateral type borrows from the same pool per asset, so liquidity and risk are
            listed separately.
          </p>
        </div>

        <section className="space-y-3">
          <h2 className="text-sm font-medium text-[var(--muted)] uppercase tracking-wide">Lending pools</h2>
          {/* Scrolls rather than clips. `overflow-hidden` alone rounded the card's corners by
              cutting the last columns off any viewport too narrow for the table, which on a phone
              is both borrow rates. */}
          <div className="card overflow-x-auto">
            <table className="w-full text-sm min-w-[44rem]">
              <thead className="text-left text-[var(--muted-strong)] border-b border-[var(--border)]">
                <tr>
                  <th className="p-3">Asset</th>
                  <th className="p-3 text-right">Supplied</th>
                  <th className="p-3 text-right">Borrowed</th>
                  <th className="p-3 text-right">Available</th>
                  <th className="p-3 text-right">Utilization</th>
                  <th className="p-3 text-right">Supply APR</th>
                  <th className="p-3 text-right">Borrow APR</th>
                </tr>
              </thead>
              <tbody>
                <TableBody
                  rows={pools}
                  isError={poolsError}
                  columns={POOL_COLUMNS}
                  subject="lending pools"
                  empty="No lending pools are deployed."
                  render={(p) => <PoolRow key={p.id} pool={p} />}
                />
              </tbody>
            </table>
          </div>
          {/* Utilization is the pool's own figure, and it is not the ratio of the two columns to
              its left: `_updateRates` divides by `totalSupply + protocolReserves`, so the
              protocol's accumulated cut sits in the denominator without appearing under Supplied.
              The gap is small and stating it costs one line. Available is the cash actually held,
              which is what bounds a borrow — not `Supplied − Borrowed`, for the same reason. */}
          <p className="text-xs text-[var(--muted)]">
            Utilization counts the protocol&rsquo;s accrued reserves alongside lender deposits, so it
            reads slightly below Borrowed ÷ Supplied. Available is the borrow asset the pool holds
            right now, and is the ceiling on any single borrow.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-medium text-[var(--muted)] uppercase tracking-wide">Collateral</h2>
          <div className="card overflow-x-auto">
            <table className="w-full text-sm min-w-[38rem]">
              <thead className="text-left text-[var(--muted-strong)] border-b border-[var(--border)]">
                <tr>
                  <th className="p-3">Type</th>
                  <th className="p-3 text-right">Max LTV</th>
                  <th className="p-3 text-right">Liquidation at</th>
                  <th className="p-3 text-right">Liquidation bonus</th>
                  <th className="p-3 text-right">Borrowed</th>
                  <th className="p-3 text-right">Borrow cap</th>
                </tr>
              </thead>
              <tbody>
                <TableBody
                  rows={collateralTypes}
                  isError={collateralError}
                  columns={COLLATERAL_COLUMNS}
                  subject="collateral types"
                  empty="No collateral types are currently accepted."
                  render={(c) => <CollateralRow key={c.id} collateral={c} />}
                />
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}

/**
 * The three states a list can be in, told apart.
 *
 * Both tables previously rendered `(rows ?? []).map(...)`, which draws headers over nothing while
 * the query is in flight, when it fails, and when the protocol genuinely has no markets. On the
 * page a user opens to decide whether this protocol is worth using, the first two look exactly like
 * the third — and "there are no markets here" is a far worse thing to say than "still loading".
 */
function TableBody<T>({
  rows,
  isError,
  columns,
  subject,
  empty,
  render,
}: {
  rows: T[] | undefined;
  isError: boolean;
  columns: number;
  /** Plural noun for what this table lists, so the two shared messages name the right thing. */
  subject: string;
  /** What to say when the query succeeded and returned nothing, which is table-specific. */
  empty: string;
  render: (row: T) => React.ReactNode;
}) {
  // The error branch is reached only with no data at all. A failed *refetch* leaves the previous
  // rows cached, and replacing a readable table with an error message would hide figures that are
  // merely a few blocks old; the layout's subgraph banner already reports that staleness, and says
  // more about it than this row could.
  if (rows === undefined) {
    return (
      <TableMessage columns={columns}>
        {isError
          ? `Could not reach the indexer, so ${subject} cannot be listed. Positions and balances are read from the chain directly and are unaffected.`
          : `Loading ${subject}…`}
      </TableMessage>
    );
  }
  if (rows.length === 0) return <TableMessage columns={columns}>{empty}</TableMessage>;
  return <>{rows.map(render)}</>;
}

function TableMessage({columns, children}: {columns: number; children: React.ReactNode}) {
  return (
    <tr>
      <td colSpan={columns} className="p-6 text-center text-[var(--muted)]">
        {children}
      </td>
    </tr>
  );
}

/**
 * One row, from the same hook `/borrow` and `/portfolio` price a loan with.
 *
 * This row used to read the pool itself: state, rate model, reserve factor and both rates, none of
 * it polled and none of it nullified on a failed read. So the page whose whole purpose is to state
 * current market conditions was the only one in the app pinned to the moment it mounted, and it
 * quoted a different APR for the same pool than the pages a user acts on.
 */
function PoolRow({pool}: {pool: SubgraphPool}) {
  const market = usePoolMarket(pool.address as `0x${string}`, pool.borrowAsset as `0x${string}`);

  const fmt = (v: bigint | undefined) =>
    v === undefined ? '—' : Number(formatUnits(v, pool.decimals)).toLocaleString('en-US', {maximumFractionDigits: 2});

  return (
    <tr className="border-b border-[var(--border)] last:border-0">
      <td className="p-3 font-medium">{pool.symbol}</td>
      <td className="p-3 text-right tabular-nums">{fmt(market?.totalSupply)}</td>
      <td className="p-3 text-right tabular-nums">{fmt(market?.totalBorrow)}</td>
      <td className="p-3 text-right tabular-nums">{fmt(market?.liquidity)}</td>
      <td className="p-3 text-right tabular-nums">
        {market === undefined ? '—' : `${(Number(market.utilization) / 100).toFixed(1)}%`}
      </td>
      <td className="p-3 text-right tabular-nums text-green-400">{formatAprBps(market?.supplyAprBps)}</td>
      <td className="p-3 text-right tabular-nums text-yellow-400">{formatAprBps(market?.borrowAprBps)}</td>
    </tr>
  );
}

// Borrow caps are 18-dec USD. RiskManager uses uint256 max as the "uncapped" sentinel, which
// would otherwise render as a meaningless 1.16e59.
const NO_BORROW_CAP = (1n << 256n) - 1n;

function CollateralRow({collateral}: {collateral: SubgraphCollateralType}) {
  const usd = (v: string) => `$${Number(v).toLocaleString('en-US', {maximumFractionDigits: 0})}`;
  const cap = BigInt(collateral.borrowCap);

  return (
    <tr className="border-b border-[var(--border)] last:border-0">
      <td className="p-3 font-medium">{collateral.id} LP</td>
      <td className="p-3 text-right tabular-nums">{bpsPct(collateral.maxLtv)}</td>
      <td className="p-3 text-right tabular-nums">{bpsPct(collateral.liquidationThreshold)}</td>
      <td className="p-3 text-right tabular-nums">{bpsPct(collateral.liquidationBonus, 1)}</td>
      {/* currentBorrows is a subgraph BigDecimal, already scaled down to whole USD — unlike
          borrowCap below, which is the raw 18-dec BigInt read straight off RiskManager. */}
      <td className="p-3 text-right tabular-nums">{usd(collateral.currentBorrows)}</td>
      <td className="p-3 text-right tabular-nums">
        {cap === NO_BORROW_CAP ? 'Uncapped' : usd(formatUnits(cap, 18))}
      </td>
    </tr>
  );
}
