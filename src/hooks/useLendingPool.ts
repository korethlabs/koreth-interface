'use client';

import {useReadContract, useReadContracts} from 'wagmi';
import {erc20Abi} from 'viem';
import {lendingPoolAbi, protocolCoreAbi} from '@/generated/abis';
import {deployments} from '@/generated/deployments';
import {LIVE_REFETCH_MS} from '@/lib/chain';

const BPS = 10_000n;

/**
 * Share of the pool's idle cash the interface offers to withdraw, in bps.
 *
 * withdraw() accrues interest before it divides, so the payout it computes is larger than the one
 * derived from the state read here, while the cash on hand can meanwhile be drawn down by a borrow
 * in an earlier block. Offering the exact liquidity therefore reverts INSUFFICIENT_LIQUIDITY on
 * both counts. This is the same holdback the borrow page applies to a borrow, for the same reason.
 *
 * It bounds only the liquidity-derived cap, never the position itself: when the pool can already
 * cover the whole balance the constraint is not binding, and shaving 1% off a full exit would
 * strand a remainder the lender could never withdraw.
 */
const WITHDRAW_HEADROOM_BPS = 9_900n;

/**
 * Everything one lender can currently do with one pool, from the pool's own storage.
 *
 * The subgraph is not a source for any of it: its figures are the arguments and the bounds of a
 * transaction the pool will check against its own state, and it trails the chain by however far
 * indexing is behind.
 */
export type PoolLenderState = {
  /** The caller's share balance, as `withdraw` will check it. */
  shares: bigint;
  /** What that balance is worth in the borrow asset. */
  redeemable: bigint;
  /** The most of it the pool can actually pay out right now, in the borrow asset. */
  withdrawable: bigint;
  /** True when idle cash, not the balance, is what limits the withdrawal. */
  liquidityCapped: boolean;
  /** Shares to burn for a payout of `amount`, saturating to the whole position at the cap. */
  sharesFor: (amount: bigint) => bigint;
  /** No shares outstanding: the next deposit is the first, and forfeits `deadShares`. */
  isEmpty: boolean;
  /** Units of the borrow asset the first deposit gives up to 0xdead, and must exceed. */
  deadShares: bigint;
  /** Everything lenders have in the pool, in the borrow asset. */
  totalSupply: bigint;
  /** Pool utilization in bps, as the pool last recorded it. */
  utilization: bigint;
  refetch: () => void;
};

/**
 * Whether the protocol is paused. Both supply() and withdraw() carry `whenNotPaused`, which reads
 * this same flag, so a pause thrown while the page is open turns every action on it into a revert.
 *
 * Undefined means unread, and callers treat that as "do not offer the action": an admin can throw
 * this switch at any time, so a cached `false` from before a pause is exactly the answer that must
 * not be trusted.
 */
export function useProtocolPaused(): boolean | undefined {
  const {data, isError} = useReadContract({
    address: deployments.core,
    abi: protocolCoreAbi,
    functionName: 'paused',
    query: {refetchInterval: LIVE_REFETCH_MS},
  });
  return isError ? undefined : (data as boolean | undefined);
}

export function usePoolLenderState(
  pool: `0x${string}`,
  borrowAsset: `0x${string}`,
  owner: `0x${string}`,
): PoolLenderState | undefined {
  const {data, isError, refetch} = useReadContracts({
    contracts: [
      {address: pool, abi: lendingPoolAbi, functionName: 'shares', args: [owner]},
      {address: pool, abi: lendingPoolAbi, functionName: 'totalShares'},
      {address: pool, abi: lendingPoolAbi, functionName: 'getPoolState'},
      {address: pool, abi: lendingPoolAbi, functionName: 'DEAD_SHARES'},
      // Idle cash, which is what withdraw() checks the payout against — not totalSupply, which
      // counts the assets borrowers have already taken out of the pool.
      {address: borrowAsset, abi: erc20Abi, functionName: 'balanceOf', args: [pool]},
    ],
    // Borrows and repayments move the cash on hand between blocks, so the cap below is re-read
    // rather than pinned to the moment the page mounted.
    query: {refetchInterval: LIVE_REFETCH_MS},
  });

  // A failed refetch leaves the last successful figures cached, and these bound a transaction: a
  // stale cap is one the pool will reject. Per-call failures land as an undefined result.
  if (isError) return undefined;
  const shares = data?.[0].result;
  const totalShares = data?.[1].result;
  const state = data?.[2].result;
  const deadShares = data?.[3].result;
  const available = data?.[4].result;
  if (
    shares === undefined ||
    totalShares === undefined ||
    state === undefined ||
    deadShares === undefined ||
    available === undefined
  ) {
    return undefined;
  }

  const totalSupply = state.totalSupply;
  const isEmpty = totalShares === 0n;
  // A pool with shares outstanding but nothing behind them is the insolvent state supply() rejects
  // as MARKET_INSOLVENT. There is no share price to convert with, and reporting zero would say the
  // position is worth nothing rather than that it cannot be valued.
  const priced = !isEmpty && totalSupply > 0n;

  const redeemable = priced ? (shares * totalSupply) / totalShares : 0n;
  const liquidityCapShares = priced
    ? (((available * WITHDRAW_HEADROOM_BPS) / BPS) * totalShares) / totalSupply
    : 0n;
  const withdrawableShares = shares < liquidityCapShares ? shares : liquidityCapShares;
  const withdrawable = priced ? (withdrawableShares * totalSupply) / totalShares : 0n;

  return {
    shares,
    redeemable,
    withdrawable,
    liquidityCapped: withdrawableShares < shares,
    // Burning the exact cap rather than converting it back keeps a full exit exact: rounding the
    // amount down to shares and up again would leave a share behind every time.
    sharesFor: (amount) =>
      !priced ? 0n : amount >= withdrawable ? withdrawableShares : (amount * totalShares) / totalSupply,
    isEmpty,
    deadShares,
    totalSupply,
    utilization: state.utilization,
    refetch,
  };
}
