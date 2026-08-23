'use client';

import {useState} from 'react';
import {useAccount, useReadContract} from 'wagmi';
import {erc20Abi, formatUnits, parseUnits} from 'viem';
import {deployments} from '@/generated/deployments';
import {positionManagerAbi, lendingEngineAbi} from '@/generated/abis';
import {useSubgraphPositions, useSupplyPositions} from '@/hooks/useSubgraph';
import {usePositionValue} from '@/hooks/usePositionValue';
import {NO_DEBT_HEALTH_FACTOR} from '@/hooks/useCollateralConfig';
import {isOpenOnChain, positionTitle, useOnChainPosition} from '@/hooks/useOnChainPosition';
import {usePoolLenderState, usePoolMarket, useProtocolPaused} from '@/hooks/useLendingPool';
import {type SubgraphPosition, type SubgraphSupplyPosition} from '@/lib/subgraph';
import {TxButton} from '@/components/TxButton';
import {ActionButton} from '@/components/ActionButton';
import {PoolWithdraw} from '@/components/PoolWithdraw';
import {TokenChip} from '@/components/TokenChip';
import {UsdValue} from '@/components/UsdValue';
import {LIVE_REFETCH_MS} from '@/lib/chain';

function parseAmount(v: string, decimals: number): bigint {
  try {
    return v ? parseUnits(v, decimals) : 0n;
  } catch {
    return 0n;
  }
}

// getHealthFactor returns exactly uint256.max when there is no debt, and that is the only case ∞
// stands for: a position carrying dust against whole collateral also reaches an enormous factor,
// and reading it as debt-free would be wrong. Those are capped rather than printed in full.
function formatHealth(hf: bigint | undefined): string {
  if (hf === undefined) return '—';
  if (hf === NO_DEBT_HEALTH_FACTOR) return '∞';
  if (hf > 1_000n * 10n ** 18n) return '> 1000';
  return Number(formatUnits(hf, 18)).toFixed(2);
}

export default function PortfolioPage() {
  const {address, isConnected} = useAccount();
  const {data: positions, refetch: refetchPositions} = useSubgraphPositions(address);
  const {data: supplies, refetch: refetchSupplies} = useSupplyPositions(address);
  const paused = useProtocolPaused();

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
                  <SupplyCard
                    key={s.id}
                    supply={s}
                    owner={address!}
                    paused={paused}
                    onDone={() => refetchSupplies()}
                  />
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

/**
 * The subgraph decides which pools appear here — that is a list, and being a block behind only
 * delays a card. Everything the withdrawal is sized by is read from the pool itself.
 */
function SupplyCard({
  supply,
  owner,
  paused,
  onDone,
}: {
  supply: SubgraphSupplyPosition;
  owner: `0x${string}`;
  paused: boolean | undefined;
  onDone: () => void;
}) {
  const {symbol, decimals, address, borrowAsset} = supply.pool;
  const poolAddr = address as `0x${string}`;
  const lender = usePoolLenderState(poolAddr, borrowAsset as `0x${string}`, owner);

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
            {lender === undefined
              ? '—'
              : Number(formatUnits(lender.redeemable, decimals)).toLocaleString('en-US', {
                  maximumFractionDigits: 2,
                })}
          </p>
        </div>
      </div>
      <PoolWithdraw
        pool={{address: poolAddr, symbol, decimals}}
        lender={lender}
        active={paused === false}
        onDone={() => {
          lender?.refetch();
          onDone();
        }}
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

  // Polled: debt accrues every block, and the health factor and capacity move with the LP price.
  const live = {refetchInterval: LIVE_REFETCH_MS} as const;
  const {data: debt, isError: debtError, refetch: refetchDebt} = useReadContract({
    address: deployments.lendingEngine,
    abi: lendingEngineAbi,
    functionName: 'getDebt',
    args: [id],
    query: live,
  });
  const {data: health, isError: healthError, refetch: refetchHealth} = useReadContract({
    address: deployments.positionManager,
    abi: positionManagerAbi,
    functionName: 'getHealthFactor',
    args: [id],
    query: live,
  });
  const {data: maxBorrow, isError: maxBorrowError} = useReadContract({
    address: deployments.lendingEngine,
    abi: lendingEngineAbi,
    functionName: 'getMaxBorrow',
    args: [id],
    query: live,
  });
  const {data: allowance, refetch: refetchAllow} = useReadContract({
    address: asset,
    abi: erc20Abi,
    functionName: 'allowance',
    args: [owner, deployments.lendingEngine],
  });
  const collateral = usePositionValue(id);
  const {position: onChain, refetch: refetchOnChain} = useOnChainPosition(id);

  // The rate this position is paying, from the same hook the borrow page prices a new draw with, so
  // the two pages cannot quote different costs for the same debt. Previously read inline here with
  // the utilization coalesced to zero, which showed the model's base rate — a real, confident,
  // wrong number — whenever the pool state had not landed yet.
  const market = usePoolMarket(position.pool.address as `0x${string}`, asset);

  // An errored read counts as missing rather than as its last cached answer. Zero is not a safe
  // stand-in here: it is what decides the card offers a withdraw instead of a repay, and withdraw()
  // reverts on any outstanding debt.
  const debtRaw = debtError ? undefined : (debt as bigint | undefined);
  const debtBn = debtRaw ?? 0n;
  const parsed = parseAmount(repayAmt, decimals);
  const noDebt = debtRaw === 0n;

  const refetchAll = () => {
    refetchDebt();
    refetchHealth();
    refetchAllow();
    // Includes the position record: withdraw() closes it, and the collateral cell gates on that
    // status rather than on the subgraph's.
    refetchOnChain();
    onDone();
  };

  return (
    <div className="card p-6 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          {/* Named by what it holds rather than by its sequential id, which tells the user nothing
              about which of their positions they are looking at. The id stays underneath: two V2
              deposits of the same pair carry the same name, and this is the card that asks which
              debt to repay. */}
          <h2 className="text-lg font-semibold leading-tight">{positionTitle(onChain, position.id)}</h2>
          <p className="text-xs text-[var(--muted)]">Position #{position.id}</p>
        </div>
        <span className="text-sm text-[var(--muted-strong)] capitalize">{position.status}</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
        {/* Live, so it can't contradict the health factor two cells over. A closed position has
            already had its LP returned, and getPositionValue would still price it — so the status
            gating this comes from the position record itself, not from the index that lags it. */}
        <Stat
          label="Collateral"
          value={
            isOpenOnChain(onChain) ? (
              <UsdValue {...collateral} approx={false} maximumFractionDigits={0} />
            ) : (
              '—'
            )
          }
        />
        <Stat
          label="Debt"
          value={
            debtRaw === undefined
              ? '—'
              : `${Number(formatUnits(debtRaw, decimals)).toLocaleString('en-US', {maximumFractionDigits: 2})} ${symbol}`
          }
        />
        <Stat
          label="Borrow APR"
          value={market === undefined ? '—' : `${(Number(market.borrowAprBps) / 100).toFixed(2)}%`}
        />
        <Stat label="Health" value={formatHealth(healthError ? undefined : (health as bigint | undefined))} />
        <Stat
          label="Max borrow"
          value={
            maxBorrowError || maxBorrow === undefined
              ? '—'
              : `${Number(formatUnits(maxBorrow as bigint, decimals)).toLocaleString('en-US', {maximumFractionDigits: 0})} ${symbol}`
          }
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

      {/* Offered on the same record the collateral cell reads, not on the subgraph's: the blocks
          right after a withdraw are precisely when the index still says the position is open, and
          that is when this button would invite a second withdraw of an LP already returned. */}
      {noDebt && isOpenOnChain(onChain) && (
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
