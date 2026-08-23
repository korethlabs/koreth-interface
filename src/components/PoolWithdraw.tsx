'use client';

import {useState} from 'react';
import {formatUnits, parseUnits} from 'viem';
import {lendingPoolAbi} from '@/generated/abis';
import type {PoolLenderState} from '@/hooks/useLendingPool';
import {TxButton} from './TxButton';

function parseAmount(v: string, decimals: number): bigint {
  try {
    return v ? parseUnits(v, decimals) : 0n;
  } catch {
    return 0n;
  }
}

/**
 * Redeeming a lender's shares for the borrow asset, bounded by what the pool can actually pay.
 *
 * withdraw() checks the payout against the cash sitting in the pool, not against what the pool owes
 * — borrowers have taken the rest — so a lender in a pool with any utilization can be owed more
 * than is currently withdrawable. An all-or-nothing button reverts INSUFFICIENT_LIQUIDITY there and
 * leaves them with no way out at all, including the part the pool could have paid.
 *
 * The amount is entered in the borrow asset because that is the unit the lender deposited and is
 * owed in; shares are an internal accounting unit whose price moves with accrued interest. The
 * conversion happens here, and `withdraw` is still handed shares, which is what it burns.
 */
export function PoolWithdraw({
  pool,
  lender,
  active,
  onDone,
}: {
  pool: {address: `0x${string}`; symbol: string; decimals: number};
  lender: PoolLenderState | undefined;
  /** False when the protocol is paused or its state has not been read; withdraw() refuses both. */
  active: boolean;
  onDone: () => void;
}) {
  const [amount, setAmount] = useState('');

  if (lender === undefined || lender.shares === 0n) return null;

  const parsed = parseAmount(amount, pool.decimals);
  const sharesToBurn = lender.sharesFor(parsed);
  const valid = active && parsed > 0n && parsed <= lender.withdrawable && sharesToBurn > 0n;

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between text-xs text-[var(--muted)]">
        <span>Withdraw</span>
        <button
          onClick={() => setAmount(formatUnits(lender.withdrawable, pool.decimals))}
          disabled={lender.withdrawable === 0n}
          className="hover:text-[var(--foreground)] disabled:opacity-40"
        >
          {Number(formatUnits(lender.withdrawable, pool.decimals)).toLocaleString('en-US', {
            maximumFractionDigits: 2,
          })}{' '}
          {pool.symbol} · Max
        </button>
      </div>
      {/* Split on whether anything at all can be paid: at a zero cap "only part of your balance"
          describes a withdrawal the lender cannot make, and the Max button above is disabled. */}
      {lender.liquidityCapped && (
        <p className="text-xs text-[var(--muted-strong)]">
          {lender.withdrawable === 0n
            ? 'Borrowers are currently holding this entire pool, so none of your balance can be paid out right now. It becomes available as loans are repaid.'
            : 'Borrowers are currently holding most of this pool, so only part of your balance can be paid out right now. The rest becomes available as loans are repaid.'}
        </p>
      )}
      <div className="flex gap-2">
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.0"
          inputMode="decimal"
          className="input flex-1 p-2.5"
        />
        <TxButton
          address={pool.address}
          abi={lendingPoolAbi}
          functionName="withdraw"
          // Shares, not an amount: withdraw() burns shares and derives the payout itself, and the
          // count comes from the pool's own storage rather than from an indexed copy of it that can
          // report more than the lender holds.
          args={[sharesToBurn]}
          label="Withdraw"
          disabled={!valid}
          onConfirmed={() => {
            setAmount('');
            onDone();
          }}
        />
      </div>
    </div>
  );
}
