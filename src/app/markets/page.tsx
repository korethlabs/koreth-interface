'use client';

import {useReadContract} from 'wagmi';
import {formatUnits} from 'viem';
import {marketAbi, interestRateModelAbi} from '@/generated/abis';
import {useSubgraphMarkets} from '@/hooks/useSubgraph';
import type {SubgraphMarket} from '@/lib/subgraph';

// MarketState.supplyRate/borrowRate are PER-SECOND rates scaled by 1e18; utilization is bps.
// The protocol accrues interest linearly, so APR = ratePerSecond * secondsPerYear.
const SECONDS_PER_YEAR = 31_557_600n; // 365.25 days (matches InterestRateModel)
function aprPct(ratePerSec: bigint | undefined): string {
  if (ratePerSec === undefined) return '—';
  const annual = Number(formatUnits(ratePerSec * SECONDS_PER_YEAR, 18));
  return `${(annual * 100).toFixed(2)}%`;
}

export default function MarketsPage() {
  const {data: markets} = useSubgraphMarkets();

  return (
    <main className="min-h-screen p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <h1 className="text-3xl font-bold">Markets</h1>
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="text-left text-[var(--muted-strong)] border-b border-[var(--border)]">
              <tr>
                <th className="p-3">Market</th>
                <th className="p-3">Collateral</th>
                <th className="p-3 text-right">Supplied</th>
                <th className="p-3 text-right">Borrowed</th>
                <th className="p-3 text-right">Utilization</th>
                <th className="p-3 text-right">Supply APR</th>
                <th className="p-3 text-right">Borrow APR</th>
                <th className="p-3 text-right">Max LTV</th>
              </tr>
            </thead>
            <tbody>
              {(markets ?? []).map((m) => (
                <MarketRow key={m.id} market={m} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}

function MarketRow({market}: {market: SubgraphMarket}) {
  const addr = market.address as `0x${string}`;
  const {data: state} = useReadContract({address: addr, abi: marketAbi, functionName: 'getMarketState'});
  const {data: irm} = useReadContract({address: addr, abi: marketAbi, functionName: 'interestRateModel'});
  const {data: reserve} = useReadContract({address: addr, abi: marketAbi, functionName: 'reserveFactorBps'});

  const s = state as {totalSupply: bigint; totalBorrow: bigint; utilization: bigint} | undefined;
  const util = s?.utilization ?? 0n;
  const irmAddr = irm as `0x${string}` | undefined;

  // Live current rates from the interest-rate model (stored state rates are 0 for idle markets).
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
    v === undefined ? '—' : Number(formatUnits(v, market.decimals)).toLocaleString('en-US', {maximumFractionDigits: 2});

  return (
    <tr className="border-b border-[var(--border)] last:border-0">
      <td className="p-3 font-medium">{market.symbol} <span className="text-[var(--muted)]">#{market.id}</span></td>
      <td className="p-3 text-[var(--muted-strong)]">{market.lpType} LP</td>
      <td className="p-3 text-right">{fmt(s?.totalSupply)}</td>
      <td className="p-3 text-right">{fmt(s?.totalBorrow)}</td>
      <td className="p-3 text-right">{s ? `${(Number(s.utilization) / 100).toFixed(1)}%` : '—'}</td>
      <td className="p-3 text-right text-green-400">{aprPct(supplyRatePerSec as bigint | undefined)}</td>
      <td className="p-3 text-right text-yellow-400">
        {borrowAprBps === undefined ? '—' : `${(Number(borrowAprBps) / 100).toFixed(2)}%`}
      </td>
      <td className="p-3 text-right">{(Number(market.maxLtv) / 100).toFixed(0)}%</td>
    </tr>
  );
}
