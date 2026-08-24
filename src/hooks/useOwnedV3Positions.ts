'use client';

import {useMemo} from 'react';
import {useReadContract, useReadContracts} from 'wagmi';
import {V3_NFT_MANAGER, nftManagerAbi} from '@/lib/v3';

/**
 * viem decodes a multi-output function as a positional tuple rather than an object, and
 * `positions()` has twelve outputs — so the fields are read by index. Only the first eight are
 * named here; the rest are fee-growth and owed-token accounting this page does not use.
 */
type V3PositionResult = readonly [
  bigint, // nonce
  string, // operator
  string, // token0
  string, // token1
  number, // fee
  number, // tickLower
  number, // tickUpper
  bigint, // liquidity
  ...unknown[],
];

/** One V3 NFT held by the wallet, described by what it is a position in. */
export interface OwnedV3Position {
  id: bigint;
  token0: string;
  token1: string;
  fee: number;
  tickLower: number;
  tickUpper: number;
}

/**
 * Every Uniswap V3 position NFT in a wallet, with the pair and range each one holds.
 *
 * The manager is enumerable, so the list is `balanceOf` followed by one `tokenOfOwnerByIndex` per
 * index and one `positions()` per id. Which of these the protocol will accept is not decided here:
 * that is a question about the whitelist, and the caller answers it against useAcceptedCollateral.
 *
 * Positions with zero liquidity are dropped. They are NFTs the user still owns but that hold
 * nothing — burnt or fully withdrawn — and the oracle prices them at zero, so offering one is
 * offering a deposit that locks a token for no borrowing capacity.
 *
 * Returns three states, because a caller rendering a list needs all three: `isLoading` while the
 * three batches run, `isError` if any read failed, and otherwise the positions. Both flags come
 * with an empty list rather than a partial one — a list that is quietly shorter than the wallet is
 * the failure mode this hook exists to avoid, since the user has no way to tell a position the
 * protocol will not take from one whose read did not come back.
 */
export function useOwnedV3Positions(owner: `0x${string}` | undefined) {
  const {data: nftCount, isError: countError, isLoading: countLoading, refetch} = useReadContract({
    address: V3_NFT_MANAGER,
    abi: nftManagerAbi,
    functionName: 'balanceOf',
    args: owner ? [owner] : undefined,
    query: {enabled: !!owner},
  });
  const n = countError ? 0 : Number((nftCount as bigint) ?? 0n);

  const {data: idResults, isError: idsError} = useReadContracts({
    contracts: Array.from({length: n}, (_, i) => ({
      address: V3_NFT_MANAGER,
      abi: nftManagerAbi,
      functionName: 'tokenOfOwnerByIndex' as const,
      args: [owner!, BigInt(i)] as const,
    })),
    query: {enabled: !!owner && n > 0},
  });

  const tokenIds = useMemo(
    () => (idResults ?? []).map((r) => r.result as bigint).filter((x) => x !== undefined),
    [idResults],
  );

  const {data: posResults, isError: posError} = useReadContracts({
    contracts: tokenIds.map((id) => ({
      address: V3_NFT_MANAGER,
      abi: nftManagerAbi,
      functionName: 'positions' as const,
      args: [id] as const,
    })),
    query: {enabled: tokenIds.length > 0},
  });

  const positions = useMemo(
    () =>
      tokenIds
        .map((id, i) => ({id, p: posResults?.[i]?.result as V3PositionResult | undefined}))
        .filter((e): e is {id: bigint; p: V3PositionResult} => !!e.p && e.p[7] > 0n)
        .map(({id, p}) => ({
          id,
          token0: p[2],
          token1: p[3],
          fee: Number(p[4]),
          tickLower: p[5],
          tickUpper: p[6],
        })),
    [tokenIds, posResults],
  );

  // A count that could not be read, an id that could not be read, or a position that could not be
  // read all mean the same thing to a caller: this list is shorter than the wallet. Each shortfall
  // is only counted once its batch has landed — an unresolved read is a list still loading, not a
  // short one.
  const isError =
    countError ||
    idsError ||
    posError ||
    (idResults !== undefined && tokenIds.length < n) ||
    (posResults !== undefined && posResults.some((r) => r.status === 'failure'));

  // The three reads are sequential — each one's arguments come from the one before — so the list is
  // empty for as long as any of them is outstanding. Without this the caller renders "you have no
  // positions" three times over before the first row can possibly appear.
  const isLoading =
    !isError &&
    (countLoading ||
      (n > 0 && idResults === undefined) ||
      (tokenIds.length > 0 && posResults === undefined));

  // Emptied on either flag. A partial list is indistinguishable from a complete one on screen, and
  // the caller's own message — that none of these are in a pool the protocol accepts — would then
  // be drawn from a set that is missing the position the user came to deposit.
  return {positions: isError || isLoading ? [] : positions, isLoading, isError, refetch};
}
