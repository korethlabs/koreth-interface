'use client';

import {useState} from 'react';
import {useAccount, useReadContract} from 'wagmi';
import {erc20Abi, formatUnits, parseUnits} from 'viem';
import {lendingPoolAbi, interestRateModelAbi} from '@/generated/abis';
import {useSubgraphPools} from '@/hooks/useSubgraph';
import {
  aprBpsFromRatePerSecond,
  formatAprBps,
  usePoolLenderState,
  useProtocolPaused,
} from '@/hooks/useLendingPool';
import type {SubgraphPool} from '@/lib/subgraph';
import {LIVE_REFETCH_MS} from '@/lib/chain';
import {ActionButton} from '@/components/ActionButton';
import {PoolWithdraw} from '@/components/PoolWithdraw';
import {TokenChip} from '@/components/TokenChip';

function parseAmount(v: string, decimals: number): bigint {
  try {
    return v ? parseUnits(v, decimals) : 0n;
  } catch {
    return 0n;
  }
}

function fmt(n: number, max = 2): string {
  return n.toLocaleString('en-US', {maximumFractionDigits: max});
}

export default function EarnPage() {
  const {address, isConnected} = useAccount();
  const {data: pools} = useSubgraphPools();
  // One read for the page rather than one per card: the flag is protocol-wide, and both actions on
  // every card are gated on it.
  const paused = useProtocolPaused();

  return (
    <main className="max-w-5xl mx-auto px-6 py-16">
      {/* No aggregate across pools. Each pool is denominated in its own borrow asset, so summing
          the balances adds WETH to USDC; the total was rendered with a dollar sign, which made
          "3 WETH + 5,000 USDC" read as $5,003. Pricing them would need a feed per asset, and each
          card already states its own balance in the unit it is actually held in. */}
      <div className="mb-10">
        <h1 className="text-3xl font-semibold tracking-tight">Earn</h1>
        <p className="mt-2 text-[var(--muted-strong)]">Supply a stablecoin and earn interest from borrowers.</p>
      </div>

      {paused === true && (
        <div className="card p-4 mb-6 text-sm text-[var(--muted-strong)]">
          The protocol is paused. Supplying and withdrawing are disabled until it resumes; funds
          already supplied are unaffected.
        </div>
      )}

      {!isConnected ? (
        <div className="card p-10 text-center text-[var(--muted)]">Connect your wallet to supply.</div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {(pools ?? []).map((p) => (
            <PoolSupplyCard key={p.id} pool={p} owner={address!} paused={paused} />
          ))}
        </div>
      )}
    </main>
  );
}

function PoolSupplyCard({
  pool,
  owner,
  paused,
}: {
  pool: SubgraphPool;
  owner: `0x${string}`;
  paused: boolean | undefined;
}) {
  const [amount, setAmount] = useState('');
  const [supplying, setSupplying] = useState(false);
  const asset = pool.borrowAsset as `0x${string}`;
  const poolAddr = pool.address as `0x${string}`;
  const {decimals, symbol} = pool;

  const {data: walletBal, isError: walletBalError, refetch: refetchBal} = useReadContract({address: asset, abi: erc20Abi, functionName: 'balanceOf', args: [owner]});
  const {data: irm} = useReadContract({address: poolAddr, abi: lendingPoolAbi, functionName: 'interestRateModel'});
  const {data: reserve} = useReadContract({address: poolAddr, abi: lendingPoolAbi, functionName: 'reserveFactorBps'});
  const lender = usePoolLenderState(poolAddr, asset, owner);

  const irmAddr = irm as `0x${string}` | undefined;
  const {data: supplyRatePerSec, isError: supplyRateError} = useReadContract({
    address: irmAddr,
    abi: interestRateModelAbi,
    functionName: 'getSupplyRate',
    args: lender === undefined || reserve === undefined ? undefined : [lender.utilization, reserve as bigint],
    // Follows the utilization it is derived from rather than settling at mount: the rate moves with
    // every borrow and repayment, and an APR pinned to page load is an APR for a different pool.
    query: {enabled: !!irmAddr && lender !== undefined && reserve !== undefined, refetchInterval: LIVE_REFETCH_MS},
  });
  // Annualized and formatted through the same pair of functions `/markets` uses, so the rate quoted
  // where a lender supplies and the rate quoted where they compare pools cannot differ. Each page
  // previously carried its own copy of the year length and its own formatting.
  const apr =
    supplyRateError || supplyRatePerSec === undefined
      ? '—'
      : formatAprBps(aprBpsFromRatePerSecond(supplyRatePerSec as bigint));

  // Unknown is not zero: coalescing the wallet balance would put "0.00 · Max" on screen while the
  // read is in flight, telling a funded user they have nothing to supply.
  const balance = walletBalError ? undefined : (walletBal as bigint | undefined);

  // Both actions carry `whenNotPaused`. An unread flag counts as not actionable — an admin can
  // pause at any moment, so the cached `false` from before one is the answer least worth trusting.
  const active = paused === false;

  const parsed = parseAmount(amount, decimals);
  // The first deposit into an empty pool mints `received - DEAD_SHARES` and hands DEAD_SHARES to
  // 0xdead, so anything at or below that floor reverts BELOW_MINIMUM_DEPOSIT and anything just
  // above it silently gives up most of itself.
  const firstDeposit = lender?.isEmpty === true;
  const minDeposit = firstDeposit ? lender.deadShares + 1n : 0n;
  const canSupply =
    active && lender !== undefined && balance !== undefined && parsed > 0n && parsed <= balance && parsed >= minDeposit;

  const onDone = () => {
    refetchBal();
    lender?.refetch();
  };

  return (
    <div className="card card-hover p-5 space-y-5">
      {/* Header: token chip + APR */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <TokenChip label={pool.symbol} />
          <div>
            <p className="font-semibold leading-tight">{pool.symbol}</p>
            <p className="text-xs text-[var(--muted)]">Lent to every collateral type</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs text-[var(--muted)]">Supply APR</p>
          <p className="text-2xl font-semibold text-[var(--accent)] tabular-nums leading-tight">{apr}</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 text-sm border-y border-[var(--border)] py-3">
        <div>
          <p className="text-[var(--muted)] text-xs">Total supplied</p>
          {/* The pool's own accounting, like the balance beside it: the subgraph's copy trails the
              chain by however far indexing is behind, and a pool total smaller than the share of it
              this lender is shown to hold is the state that reads as a bug. */}
          <p className="tabular-nums">
            {lender === undefined ? '—' : fmt(Number(formatUnits(lender.totalSupply, decimals)))}
          </p>
        </div>
        <div>
          <p className="text-[var(--muted)] text-xs">Your supply</p>
          {/* The pool's own share price, not the subgraph's `suppliedAmount`: this is the figure
              the withdrawal below is bounded by, and the two disagreeing is how a lender ends up
              asking for more than they hold. */}
          <p className="tabular-nums">
            {lender === undefined ? '—' : fmt(Number(formatUnits(lender.redeemable, decimals)))}
          </p>
        </div>
      </div>

      {/* Supply */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between text-xs text-[var(--muted)]">
          <span>Wallet</span>
          <button
            onClick={() => balance !== undefined && setAmount(formatUnits(balance, decimals))}
            disabled={balance === undefined || supplying}
            className="hover:text-[var(--foreground)] disabled:opacity-40"
          >
            {balance === undefined ? '—' : fmt(Number(formatUnits(balance, decimals)))} {symbol} · Max
          </button>
        </div>
        {firstDeposit && (
          <p className="text-xs text-[var(--muted-strong)]">
            This is the first deposit into the pool, so {fmt(Number(formatUnits(lender.deadShares, decimals)), 6)}{' '}
            {symbol} is burned to seed it and cannot be withdrawn by anyone. Deposits at or below
            that amount are rejected.
          </p>
        )}
        <div className="flex gap-2">
          {/* Frozen while the supply is being served: the amount was captured when the button was
              clicked, and an editable field promises an edit that transaction will not receive. */}
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.0"
            inputMode="decimal"
            disabled={supplying}
            className="input flex-1 p-2.5 disabled:opacity-60"
          />
          <ActionButton
            approve={{token: asset, spender: poolAddr, amount: parsed}}
            address={poolAddr}
            abi={lendingPoolAbi}
            functionName="supply"
            args={[parsed]}
            label="Supply"
            disabled={!canSupply}
            onBusyChange={setSupplying}
            onConfirmed={() => {
              setAmount('');
              onDone();
            }}
          />
        </div>
      </div>

      {lender !== undefined && lender.shares > 0n && (
        <div className="border-t border-[var(--border)] pt-4">
          <PoolWithdraw
            pool={{address: poolAddr, symbol, decimals}}
            lender={lender}
            active={active}
            onDone={onDone}
          />
        </div>
      )}
    </div>
  );
}
