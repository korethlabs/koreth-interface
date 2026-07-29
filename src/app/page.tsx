'use client';

import {useProtocolStats, useSubgraphPools, useSubgraphPositions} from '../hooks/useSubgraph';

function formatUsd(value: string | undefined): string {
  const n = Number(value ?? 0);
  return n.toLocaleString('en-US', {style: 'currency', currency: 'USD', maximumFractionDigits: 2});
}

const STATUS_STYLES: Record<string, string> = {
  active: 'text-[var(--accent)] border-[var(--accent)]/40',
  borrowed: 'text-[var(--accent-2)] border-[var(--accent-2)]/40',
  liquidated: 'text-[var(--danger)] border-[var(--danger)]/40',
  closed: 'text-[var(--muted)] border-[var(--border-strong)]',
};

export default function Dashboard() {
  const {data: stats} = useProtocolStats();
  const {data: pools} = useSubgraphPools();
  const {data: positions, isLoading, error} = useSubgraphPositions();

  return (
    <main className="max-w-7xl mx-auto px-6 py-16">
      {/* Hero */}
      <section className="relative mb-16">
        <div className="max-w-2xl">
          <span className="badge text-[var(--accent)] border-[var(--accent)]/30">Powered by manipulation-resistant LP oracles</span>
          <h1 className="mt-5 text-5xl md:text-6xl font-semibold tracking-tight leading-[1.05]">
            Borrow against your LP.
            <br />
            <span className="gradient-text">Keep earning.</span>
          </h1>
          <p className="mt-5 text-lg text-[var(--muted-strong)] max-w-xl">
            Unlock liquidity from your LP positions without withdrawing — supply stablecoins to earn,
            or post LP as collateral and borrow.
          </p>
          <div className="mt-8 flex gap-3">
            <a href="/borrow" className="btn-primary px-5 py-2.5 text-sm">Borrow</a>
            <a href="/earn" className="btn-ghost px-5 py-2.5 text-sm">Earn</a>
          </div>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/koreth-logo.svg"
          alt=""
          aria-hidden
          className="hidden lg:block absolute right-0 top-1/2 -translate-y-1/2 h-72 opacity-[0.1] pointer-events-none"
        />
      </section>

      {/* Protocol stats */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-14">
        <StatCard label="Total Value Locked" value={formatUsd(stats?.totalTVL)} />
        <StatCard label="Total Borrowed" value={formatUsd(stats?.globalBorrowsUsd)} />
        <StatCard label="Active Positions" value={stats?.totalPositions ?? '0'} />
        <StatCard label="Lending pools" value={pools ? String(pools.length) : '0'} />
      </section>

      {/* Positions */}
      <section>
        <h2 className="text-xl font-semibold mb-4">Positions</h2>
        <div className="card overflow-hidden">
          {error ? (
            <div className="p-10 text-center text-[var(--danger)]">Failed to load: {String(error)}</div>
          ) : isLoading ? (
            <div className="p-10 text-center text-[var(--muted)]">Loading…</div>
          ) : !positions || positions.length === 0 ? (
            <div className="p-10 text-center text-[var(--muted)]">No positions indexed yet</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[var(--muted)] border-b border-[var(--border)]">
                  <th className="px-5 py-3 font-medium">ID</th>
                  <th className="px-5 py-3 font-medium">Type</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Owner</th>
                  <th className="px-5 py-3 font-medium text-right">Collateral</th>
                  <th className="px-5 py-3 font-medium text-right">Debt</th>
                </tr>
              </thead>
              <tbody>
                {positions.map((p) => (
                  <tr key={p.id} className="border-b border-[var(--border)] last:border-0 hover:bg-white/[0.015]">
                    <td className="px-5 py-3.5 font-medium">#{p.id}</td>
                    <td className="px-5 py-3.5 text-[var(--muted-strong)]">{p.lpType}</td>
                    <td className="px-5 py-3.5">
                      <span className={`badge capitalize ${STATUS_STYLES[p.status] ?? STATUS_STYLES.closed}`}>{p.status}</span>
                    </td>
                    <td className="px-5 py-3.5 font-mono text-xs text-[var(--muted)]">
                      {p.owner.slice(0, 6)}…{p.owner.slice(-4)}
                    </td>
                    <td className="px-5 py-3.5 text-right tabular-nums">{formatUsd(p.depositValue)}</td>
                    <td className="px-5 py-3.5 text-right tabular-nums">{formatUsd(p.currentDebt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </main>
  );
}

function StatCard({label, value}: {label: string; value: string}) {
  return (
    <div className="card card-hover p-5">
      <p className="text-sm text-[var(--muted)]">{label}</p>
      <p className="text-2xl font-semibold mt-1.5 tabular-nums">{value}</p>
    </div>
  );
}
