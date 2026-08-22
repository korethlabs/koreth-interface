'use client';

import {useState} from 'react';
import {useAccount, useReadContract} from 'wagmi';
import {erc20Abi, formatUnits, parseUnits} from 'viem';
import {deployments} from '@/generated/deployments';
import {positionManagerAbi, lendingEngineAbi, lendingPoolAbi, interestRateModelAbi} from '@/generated/abis';
import {useSubgraphPositions, useSupplyPositions} from '@/hooks/useSubgraph';
import {usePositionValue} from '@/hooks/usePositionValue';
import {isPositionOpen, type SubgraphPosition, type SubgraphSupplyPosition} from '@/lib/subgraph';
import {TxButton} from '@/components/TxButton';
import {ActionButton} from '@/components/ActionButton';
import {TokenChip} from '@/components/TokenChip';
import {UsdValue} from '@/components/UsdValue';

function parseAmount(v: string, decimals: number): bigint {
  try {
    return v ? parseUnits(v, decimals) : 0n;
  } catch {
    return 0n;
  }
}

// getHealthFactor returns uint256.max when there's no debt; show ∞ for very large values.
function formatHealth(hf: bigint | undefined): string {
  if (hf === undefined) return '—';
  if (hf > 10n ** 30n) return '∞';
  return Number(formatUnits(hf, 18)).toFixed(2);
}

export default function PortfolioPage() {
  const {address, isConnected} = useAccount();
  const {data: positions, refetch: refetchPositions} = useSubgraphPositions(address);
  const {data: supplies, refetch: refetchSupplies} = useSupplyPositions(address);

  const borrows = positions ?? [];
  const lends = supplies ?? [];

  return (
    <main className="max-w-5xl mx-auto px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight mb-10">Portfolio</h1>

      {!isConnected ? (
        <div className="card p-10 text-center text-[var(--muted)]">Connect your wallet to view your positions.</div>
      ) : (
        <div className="space-y-10">
          <section>
            <h2 className="text-sm font-medium text-[var(--muted)] uppercase tracking-wide mb-3">Supplies (lending)</h2>
            {lends.length === 0 ? (
              <div className="card p-8 text-center text-[var(--muted)]">No supplies — earn yield on the Earn page.</div>
            ) : (
              <div className="grid md:grid-cols-2 gap-4">
                {lends.map((s) => (
                  <SupplyCard key={s.id} supply={s} onDone={() => refetchSupplies()} />
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 className="text-sm font-medium text-[var(--muted)] uppercase tracking-wide mb-3">Borrows</h2>
            {borrows.length === 0 ? (
              <div className="card p-8 text-center text-[var(--muted)]">No positions — deposit collateral on the Borrow page.</div>
            ) : (
              <div className="grid md:grid-cols-2 gap-4">
                {borrows.map((p) => (
                  <PositionCard key={p.id} position={p} owner={address!} onDone={() => refetchPositions()} />
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </main>
  );
}

function SupplyCard({supply, onDone}: {supply: SubgraphSupplyPosition; onDone: () => void}) {
  const {symbol, address: poolAddr} = supply.pool;
  const shares = BigInt(supply.shares);
  return (
    <div className="card card-hover p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <TokenChip label={symbol} />
          <div>
            <p className="font-semibold leading-tight">{symbol}</p>
            <p className="text-xs text-[var(--muted)]">Supplied</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs text-[var(--muted)]">Your supply</p>
          <p className="text-xl font-semibold tabular-nums leading-tight">
            {Number(supply.suppliedAmount).toLocaleString('en-US', {maximumFractionDigits: 2})}
          </p>
        </div>
      </div>
      <TxButton
        address={poolAddr as `0x${string}`}
        abi={lendingPoolAbi}
        functionName="withdraw"
        args={[shares]}
        label="Withdraw all"
        onConfirmed={onDone}
      />
    </div>
  );
}

function PositionCard({
  position,
  owner,
  onDone,
}: {
  position: SubgraphPosition;
  owner: `0x${string}`;
  onDone: () => void;
}) {
  const [repayAmt, setRepayAmt] = useState('');
  const [repaidNote, setRepaidNote] = useState<string | null>(null);
  const id = BigInt(position.id);
  const asset = position.pool.borrowAsset as `0x${string}`;
  const {symbol, decimals} = position.pool;

  const {data: debt, refetch: refetchDebt} = useReadContract({
    address: deployments.lendingEngine,
    abi: lendingEngineAbi,
    functionName: 'getDebt',
    args: [id],
  });
  const {data: health, refetch: refetchHealth} = useReadContract({
    address: deployments.positionManager,
    abi: positionManagerAbi,
    functionName: 'getHealthFactor',
    args: [id],
  });
  const {data: maxBorrow} = useReadContract({
    address: deployments.lendingEngine,
    abi: lendingEngineAbi,
    functionName: 'getMaxBorrow',
    args: [id],
  });
  const {data: allowance, refetch: refetchAllow} = useReadContract({
    address: asset,
    abi: erc20Abi,
    functionName: 'allowance',
    args: [owner, deployments.lendingEngine],
  });
  const collateral = usePositionValue(id);

  // Live borrow APR for this position's pool (same read as the Markets page): interest-rate
  // model rate at the pool's current utilization. Shared across every collateral type now.
  const poolAddr = position.pool.address as `0x${string}`;
  const {data: poolState} = useReadContract({address: poolAddr, abi: lendingPoolAbi, functionName: 'getPoolState'});
  const {data: irm} = useReadContract({address: poolAddr, abi: lendingPoolAbi, functionName: 'interestRateModel'});
  const irmAddr = irm as `0x${string}` | undefined;
  const util = (poolState as {utilization: bigint} | undefined)?.utilization ?? 0n;
  const {data: borrowAprBps} = useReadContract({
    address: irmAddr,
    abi: interestRateModelAbi,
    functionName: 'getBorrowRateAPR',
    args: [util],
    query: {enabled: !!irmAddr && poolState !== undefined},
  });

  const debtBn = (debt as bigint) ?? 0n;
  const parsed = parseAmount(repayAmt, decimals);
  const noDebt = debtBn === 0n;

  const refetchAll = () => {
    refetchDebt();
    refetchHealth();
    refetchAllow();
    onDone();
  };

  return (
    <div className="card p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Position #{position.id}</h2>
        <span className="text-sm text-[var(--muted-strong)] capitalize">{position.status}</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
        {/* Live, so it can't contradict the health factor two cells over. A closed position has
            already had its LP returned, and getPositionValue would still price it. */}
        <Stat
          label="Collateral"
          value={
            isPositionOpen(position.status) ? (
              <UsdValue {...collateral} approx={false} maximumFractionDigits={0} />
            ) : (
              '—'
            )
          }
        />
        <Stat label="Debt" value={`${Number(formatUnits(debtBn, decimals)).toLocaleString('en-US', {maximumFractionDigits: 2})} ${symbol}`} />
        <Stat
          label="Borrow APR"
          value={borrowAprBps === undefined ? '—' : `${(Number(borrowAprBps) / 100).toFixed(2)}%`}
        />
        <Stat label="Health" value={formatHealth(health as bigint | undefined)} />
        <Stat
          label="Max borrow"
          value={`${Number(formatUnits((maxBorrow as bigint) ?? 0n, decimals)).toLocaleString('en-US', {maximumFractionDigits: 0})} ${symbol}`}
        />
      </div>

      {repaidNote && (
        <p className="text-sm text-[var(--accent)]">
          ✓ Repaid {repaidNote} {symbol}.{' '}
          {noDebt ? 'Debt cleared — you can now withdraw your collateral below.' : 'Your remaining debt is shown above.'}
        </p>
      )}

      {!noDebt && (
        <div className="space-y-2">
          <div className="flex gap-2 items-start">
            <input
              value={repayAmt}
              onChange={(e) => setRepayAmt(e.target.value)}
              placeholder={`Repay ${symbol}`}
              inputMode="decimal"
              className="input flex-1 p-2.5"
            />
            <button
              onClick={() => setRepayAmt(formatUnits(debtBn, decimals))}
              className="btn-ghost px-3 text-sm"
            >
              Max
            </button>
            <ActionButton
              approve={{token: asset, spender: deployments.lendingEngine, amount: parsed, allowance: (allowance as bigint) ?? 0n}}
              address={deployments.lendingEngine}
              abi={lendingEngineAbi}
              functionName="repay"
              args={[id, parsed]}
              label="Repay"
              disabled={parsed === 0n || parsed > debtBn}
              onConfirmed={() => {
                // Use the exact repaid amount (bigint) rather than re-parsing the input.
                setRepaidNote(formatUnits(parsed, decimals));
                setRepayAmt('');
                refetchAll();
              }}
            />
          </div>
          <p className="text-xs text-[var(--muted)]">
            Repaying returns borrowed {symbol} to the protocol and lowers your debt. When your {symbol}
            allowance is too low you&rsquo;ll first confirm an approval, then the repayment (two wallet
            prompts). Clear your debt fully to withdraw your collateral.
          </p>
        </div>
      )}

      {noDebt && position.status !== 'closed' && (
        <TxButton
          address={deployments.positionManager}
          abi={positionManagerAbi}
          functionName="withdraw"
          args={[id]}
          label="Close & withdraw collateral"
          onConfirmed={refetchAll}
        />
      )}
    </div>
  );
}

function Stat({label, value}: {label: string; value: React.ReactNode}) {
  return (
    <div>
      <p className="text-[var(--muted)]">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}
