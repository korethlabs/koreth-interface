'use client';

import {useReadContract} from 'wagmi';
import {formatUnits} from 'viem';
import {lendingPoolAbi, interestRateModelAbi} from '@/generated/abis';
import {useSubgraphPools, useCollateralTypes} from '@/hooks/useSubgraph';
import type {SubgraphPool, SubgraphCollateralType} from '@/lib/subgraph';

// PoolState.supplyRate/borrowRate are PER-SECOND rates scaled by 1e18; utilization is bps.
// The protocol accrues interest linearly, so APR = ratePerSecond * secondsPerYear.
const SECONDS_PER_YEAR = 31_557_600n; // 365.25 days (matches InterestRateModel)
function aprPct(ratePerSec: bigint | undefined): string {
  if (ratePerSec === undefined) return '—';
  const annual = Number(formatUnits(ratePerSec * SECONDS_PER_YEAR, 18));
  return `${(annual * 100).toFixed(2)}%`;
}

function bpsPct(bps: string, digits = 0): string {
  return `${(Number(bps) / 100).toFixed(digits)}%`;
}

export default function MarketsPage() {
  const {data: pools} = useSubgraphPools();
  const {data: collateralTypes} = useCollateralTypes();

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
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="text-left text-[var(--muted-strong)] border-b border-[var(--border)]">
                <tr>
                  <th className="p-3">Asset</th>
                  <th className="p-3 text-right">Supplied</th>
                  <th className="p-3 text-right">Borrowed</th>
                  <th className="p-3 text-right">Utilization</th>
                  <th className="p-3 text-right">Supply APR</th>
                  <th className="p-3 text-right">Borrow APR</th>
                </tr>
              </thead>
              <tbody>
                {(pools ?? []).map((p) => (
                  <PoolRow key={p.id} pool={p} />
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-medium text-[var(--muted)] uppercase tracking-wide">Collateral</h2>
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
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
                {(collateralTypes ?? []).map((c) => (
                  <CollateralRow key={c.id} collateral={c} />
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}

function PoolRow({pool}: {pool: SubgraphPool}) {
  const addr = pool.address as `0x${string}`;
  const {data: state} = useReadContract({address: addr, abi: lendingPoolAbi, functionName: 'getPoolState'});
  const {data: irm} = useReadContract({address: addr, abi: lendingPoolAbi, functionName: 'interestRateModel'});
  const {data: reserve} = useReadContract({address: addr, abi: lendingPoolAbi, functionName: 'reserveFactorBps'});

  const s = state as {totalSupply: bigint; totalBorrow: bigint; utilization: bigint} | undefined;
  const util = s?.utilization ?? 0n;
  const irmAddr = irm as `0x${string}` | undefined;

  // Live current rates from the interest-rate model (stored state rates are 0 for idle pools).
  const {data: borrowAprBps} = useReadContract({
    address: irmAddr,
    abi: interestRateModelAbi,
    functionName: 'getBorrowRateAPR',
    args: [util],
    query: {enabled: !!irmAddr && s !== undefined},
  });
  const {data: supplyRatePerSec} = useReadContract({
    address: irmAddr,
    abi: interestRateModelAbi,
    functionName: 'getSupplyRate',
    args: [util, (reserve as bigint) ?? 0n],
    query: {enabled: !!irmAddr && s !== undefined && reserve !== undefined},
  });

  const fmt = (v: bigint | undefined) =>
    v === undefined ? '—' : Number(formatUnits(v, pool.decimals)).toLocaleString('en-US', {maximumFractionDigits: 2});

  return (
    <tr className="border-b border-[var(--border)] last:border-0">
      <td className="p-3 font-medium">{pool.symbol}</td>
      <td className="p-3 text-right">{fmt(s?.totalSupply)}</td>
      <td className="p-3 text-right">{fmt(s?.totalBorrow)}</td>
      <td className="p-3 text-right">{s ? `${(Number(s.utilization) / 100).toFixed(1)}%` : '—'}</td>
      <td className="p-3 text-right text-green-400">{aprPct(supplyRatePerSec as bigint | undefined)}</td>
      <td className="p-3 text-right text-yellow-400">
        {borrowAprBps === undefined ? '—' : `${(Number(borrowAprBps) / 100).toFixed(2)}%`}
      </td>
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
      <td className="p-3 text-right">{bpsPct(collateral.maxLtv)}</td>
      <td className="p-3 text-right">{bpsPct(collateral.liquidationThreshold)}</td>
      <td className="p-3 text-right">{bpsPct(collateral.liquidationBonus, 1)}</td>
      {/* currentBorrows is a subgraph BigDecimal, already scaled down to whole USD — unlike
          borrowCap below, which is the raw 18-dec BigInt read straight off RiskManager. */}
      <td className="p-3 text-right">{usd(collateral.currentBorrows)}</td>
      <td className="p-3 text-right">
        {cap === NO_BORROW_CAP ? 'Uncapped' : usd(formatUnits(cap, 18))}
      </td>
    </tr>
  );
}
