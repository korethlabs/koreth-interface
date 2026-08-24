'use client';

import {useState} from 'react';
import {useAccount} from 'wagmi';
import {formatUnits, parseUnits} from 'viem';
import {deployments} from '@/generated/deployments';
import {positionManagerAbi, lendingEngineAbi} from '@/generated/abis';
import {useSubgraphPositions, useSupplyPositions} from '@/hooks/useSubgraph';
import {isOpenOnChain, positionTitle} from '@/hooks/useOnChainPosition';
import {usePositionSummary} from '@/hooks/usePositionSummary';
import {usePoolLenderState, useProtocolPaused} from '@/hooks/useLendingPool';
import {type SubgraphPosition, type SubgraphSupplyPosition} from '@/lib/subgraph';
import {TxButton} from '@/components/TxButton';
import {ActionButton} from '@/components/ActionButton';
import {PoolWithdraw} from '@/components/PoolWithdraw';
import {HealthReadout, PositionStats} from '@/components/PositionStats';
import {TokenChip} from '@/components/TokenChip';

function parseAmount(v: string, decimals: number): bigint {
  try {
    return v ? parseUnits(v, decimals) : 0n;
  } catch {
    return 0n;
  }
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
                  <PositionCard key={p.id} position={p} onDone={() => refetchPositions()} />
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
  onDone,
}: {
  position: SubgraphPosition;
  onDone: () => void;
}) {
  const [repayAmt, setRepayAmt] = useState('');
  const [repaidNote, setRepaidNote] = useState<string | null>(null);
  const id = BigInt(position.id);
  const asset = position.pool.borrowAsset as `0x${string}`;
  const {symbol, decimals} = position.pool;

  // The same summary the borrow page acts on, so the two views of one position cannot disagree
  // about what it holds, owes, or can still draw — nor use different names for the same figure.
  const summary = usePositionSummary(id, position.pool.address as `0x${string}`, asset);
  const {debt: debtRaw, position: onChain} = summary;

  // Decided on the read itself, not on `debtBn`, whose zero also stands for a debt that has not
  // landed: this is what makes the card offer a withdraw instead of a repay, and withdraw() reverts
  // on any outstanding debt. The coalesced figure only sizes the repay input, which a zero bounds
  // harmlessly.
  const debtBn = debtRaw ?? 0n;
  const parsed = parseAmount(repayAmt, decimals);
  const noDebt = debtRaw === 0n;

  const refetchAll = () => {
    summary.refetch();
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
          <p className="text-xs text-[var(--muted)]">
            Position #{position.id} · <span className="capitalize">{position.status}</span>
          </p>
        </div>
        {/* The risk of the position, in the same place and the same words the borrow page puts it
            in. This card used to show the bare ratio in the middle of the stat grid, which left the
            figure that decides whether to repay looking like one more statistic. */}
        <HealthReadout current={summary.healthFactor} />
      </div>

      <PositionStats summary={summary} symbol={symbol} decimals={decimals} />

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
              approve={{token: asset, spender: deployments.lendingEngine, amount: parsed}}
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
