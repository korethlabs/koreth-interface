'use client';

import {useEffect, useId, useMemo, useState} from 'react';
import {useAccount, useBlockNumber, useReadContract, useReadContracts} from 'wagmi';
import {erc20Abi, formatUnits, parseUnits} from 'viem';
import {deployments} from '@/generated/deployments';
import {positionManagerAbi, lendingEngineAbi} from '@/generated/abis';
import {useCollateralTypes, useSubgraphPools, useSubgraphPositions} from '@/hooks/useSubgraph';
import {LP_TYPE_V2, LP_TYPE_V3, isOpenOnChain, positionTitle} from '@/hooks/useOnChainPosition';
import {useV2Underlying} from '@/hooks/useV2Underlying';
import {
  useAcceptedCollateral,
  isAcceptedV3Position,
  pairLabel,
  type AcceptedPool,
} from '@/hooks/useAcceptedCollateral';
import {useLpUsdValues, type LpPriceQuery} from '@/hooks/useLpUsdValue';
import {useOwnedV3Positions} from '@/hooks/useOwnedV3Positions';
import {borrowingCapacityUsd, projectedHealthFactor, useCollateralConfig, type CollateralConfig} from '@/hooks/useCollateralConfig';
import {formatAprBps, usePoolMarket} from '@/hooks/useLendingPool';
import {BORROW_HEADROOM_BPS, usePositionSummary} from '@/hooks/usePositionSummary';
import {HealthReadout, PositionStats} from '@/components/PositionStats';
import {type SubgraphPool, type SubgraphPosition} from '@/lib/subgraph';
import {TxButton} from '@/components/TxButton';
import {ActionButton} from '@/components/ActionButton';
import {TokenChip} from '@/components/TokenChip';
import {UsdValue} from '@/components/UsdValue';
import {tokenInfo} from '@/lib/tokens';
import {V3_NFT_MANAGER, isFullRange, nftManagerAbi} from '@/lib/v3';

const LP_COLOR = '#8b93ff';

/**
 * Health factor below which a borrow has to be acknowledged explicitly. Matches the threshold
 * this page already paints as a warning, so the colour and the checkbox agree on what is risky.
 */
const RISK_ACK_HEALTH_FACTOR = 15n * 10n ** 17n;

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

/**
 * A token amount with its symbol, e.g. "5 WETH", or undefined for a token whose decimals are
 * unknown — an amount that cannot be scaled is not one to print at an arbitrary scale.
 *
 * The precision follows the size rather than the token's decimals: two places would round a fraction
 * of an ETH to "0.00", and four would pad a five-figure USDC amount with digits that carry nothing.
 */
function formatTokenAmount(raw: bigint, token: string): string | undefined {
  const {symbol, decimals} = tokenInfo(token);
  if (decimals === undefined) return undefined;
  const n = Number(formatUnits(raw, decimals));
  return `${fmt(n, n >= 1_000 ? 2 : 4)} ${symbol}`;
}

export default function BorrowPage() {
  const {address, isConnected} = useAccount();
  const {data: pools} = useSubgraphPools();
  const {data: positions, refetch: refetchPositions} = useSubgraphPositions(address);

  // Every pool accepts every collateral type now, so V2 and V3 deposits pick from the same list
  // rather than each being tied to its own market. Memoized to keep a stable identity for the
  // deposit cards' default-selection effect.
  const poolList = useMemo(() => pools ?? [], [pools]);

  // Which LP types the protocol will actually accept. deposit() reverts COLLATERAL_NOT_ENABLED
  // for anything disabled in RiskManager, so rendering a card for a disabled type gives the user
  // a button that always fails. Under isolated markets this was implicit — no market, no card.
  const {data: collateralTypes, isLoading: loadingCollateral} = useCollateralTypes();
  const enabled = useMemo(() => new Set((collateralTypes ?? []).map((c) => c.id)), [collateralTypes]);

  // Which pools the protocol accepts. This used to be a constant in this file, kept in step with the
  // chain by hand; it is now enumerated from the whitelist events and confirmed pool by pool against
  // ProtocolCore, so the menu below is the protocol's own answer rather than a copy of it.
  const {data: accepted, isLoading: loadingAccepted, isError: acceptedError} = useAcceptedCollateral();

  return (
    <main className="max-w-5xl mx-auto px-6 py-16">
      <div className="mb-10">
        <h1 className="text-3xl font-semibold tracking-tight">Borrow</h1>
        <p className="mt-2 text-[var(--muted-strong)]">
          Deposit a Uniswap V2 LP or V3 position as collateral, then borrow a stablecoin.
        </p>
      </div>

      {!isConnected ? (
        <div className="card p-10 text-center text-[var(--muted)]">Connect your wallet to deposit and borrow.</div>
      ) : (
        <div className="space-y-10">
          <section>
            <h2 className="text-sm font-medium text-[var(--muted)] uppercase tracking-wide mb-3">Deposit collateral</h2>
            {/* `enabled` is empty both while the query is in flight and when the protocol really
                accepts nothing, so the loading branch comes first — otherwise every page load
                flashes the empty state before the cards appear. */}
            {loadingCollateral || loadingAccepted ? (
              <div className="card p-10 text-center text-[var(--muted)]">Loading…</div>
            ) : acceptedError || accepted === undefined ? (
              /* Deliberately not a fallback to a hardcoded pair. Which pools are accepted is
                 protocol state, and standing in for it with a guess offers a deposit nobody has
                 confirmed the protocol will take. Positions and balances are read from the chain
                 and keep working while this says nothing. */
              <div className="card p-10 text-center text-[var(--muted)]">
                The collateral the protocol accepts could not be listed. Deposits are unavailable
                until it can be read.
              </div>
            ) : enabled.size === 0 || (accepted.v2.length === 0 && accepted.v3.length === 0) ? (
              /* Two things end up here — RiskManager having disabled every LP type, and the
                 whitelist holding no pools — and the wording covers both rather than naming one.
                 Both are the protocol declining to take anything, neither is something the user
                 can act on differently, and a message that named types while the cause was an
                 empty whitelist would be precise about the wrong half. */
              <div className="card p-10 text-center text-[var(--muted)]">
                The protocol is not accepting any collateral right now.
              </div>
            ) : (
              <div className="grid lg:grid-cols-2 gap-4">
                {/* Keyed by the account, so switching wallets in the extension builds new cards
                    rather than re-rendering these with a different `owner`. Their local state is
                    all about one account — most sharply the note confirming a deposit, which
                    persists for the session and would otherwise carry a "✓ Deposited" from the
                    previous wallet onto a card now describing balances the new one has never
                    deposited.

                    The collateral type is in the key as well as the address, because these two are
                    siblings and each is mounted only while the RiskManager still accepts its type:
                    on the address alone they would share a key, and suspending one type would hand
                    its state to the other rather than unmounting it. */}
                {enabled.has('UniswapV2') && accepted.v2.length > 0 && (
                  <V2DepositCard key={`v2:${address}`} owner={address!} pools={poolList} accepted={accepted.v2} onDone={() => refetchPositions()} />
                )}
                {enabled.has('UniswapV3') && accepted.v3.length > 0 && (
                  <V3DepositCard key={`v3:${address}`} owner={address!} pools={poolList} accepted={accepted.v3} onDone={() => refetchPositions()} />
                )}
              </div>
            )}
          </section>

          <section>
            <h2 className="text-sm font-medium text-[var(--muted)] uppercase tracking-wide mb-3">Your positions</h2>
            {(positions ?? []).length === 0 ? (
              <div className="card p-10 text-center text-[var(--muted)]">No positions yet — deposit collateral above.</div>
            ) : (
              <div className="grid md:grid-cols-2 gap-4">
                {(positions ?? []).map((p) => (
                  <PositionBorrowCard key={p.id} position={p} onDone={() => refetchPositions()} />
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
 * Picks which shared pool the new position will draw from. The user chooses a borrow asset,
 * not a market — a single pool per asset now backs every collateral type.
 */
function useBorrowAssetChoice(pools: SubgraphPool[]) {
  const [borrowAsset, setBorrowAsset] = useState<`0x${string}` | ''>('');
  useEffect(() => {
    // Reset whenever the selection isn't in the list, not just when it's empty. A subgraph
    // re-index makes `pools` go empty and come back with different addresses; keeping the stale
    // one would leave the <select> rendering blank while still passing the non-empty check, and
    // the deposit would revert INVALID_POOL.
    // An empty list clears the selection rather than keeping the last one. react-query holds
    // previous data across a refetch, so an empty `pools` means the query really did come back
    // empty — and a leftover address would keep the deposit button enabled (it only checks
    // `borrowAsset !== ''`) while the form says there are no pools, sending a doomed tx.
    if (!pools.length) {
      setBorrowAsset('');
      return;
    }
    if (!pools.some((p) => p.borrowAsset === borrowAsset)) {
      setBorrowAsset(pools[0].borrowAsset as `0x${string}`);
    }
  }, [pools, borrowAsset]);
  return {borrowAsset, setBorrowAsset};
}

/**
 * One pool, priced. Its own component because the rate and the liquidity are per-pool reads, and a
 * hook cannot be called in a loop over a list whose length changes.
 */
function PoolOption({
  pool,
  group,
  selected,
  onSelect,
}: {
  pool: SubgraphPool;
  group: string;
  selected: boolean;
  onSelect: () => void;
}) {
  const market = usePoolMarket(pool.address as `0x${string}`, pool.borrowAsset as `0x${string}`);
  // The same holdback the borrow card applies, so this cannot advertise a figure that screen will
  // then refuse to offer. It is the pool's ceiling only: what this position can draw is also capped
  // by its collateral, which does not exist yet at the point this choice is made.
  const fundable = market === undefined ? undefined : (market.liquidity * BORROW_HEADROOM_BPS) / 10_000n;

  return (
    <label
      // The focusable element is the visually hidden radio, so the ring has to be drawn by the row
      // around it: without this, tabbing through the group moves an invisible cursor.
      className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--accent)] ${
        selected
          ? 'border-[var(--accent)] bg-[var(--accent)]/5'
          : 'border-[var(--border)] hover:border-[var(--muted)]'
      }`}
    >
      <input type="radio" name={group} checked={selected} onChange={onSelect} className="sr-only" />
      <span
        aria-hidden
        className={`h-3.5 w-3.5 shrink-0 rounded-full border-2 ${
          selected ? 'border-[var(--accent)] bg-[var(--accent)]' : 'border-[var(--muted)]'
        }`}
      />
      {/* The chip renders the symbol as text, which the row states again beside it. Left in the
          accessible name it would announce every option as "USDC USDC". */}
      <span aria-hidden>
        <TokenChip label={pool.symbol} />
      </span>
      <span className="font-medium">{pool.symbol}</span>
      <span className="ml-auto flex gap-5 text-right text-xs">
        <span>
          <span className="block text-[var(--muted)]">Borrow APR</span>
          <span className="tabular-nums text-sm">
            {formatAprBps(market?.borrowAprBps)}
          </span>
        </span>
        <span>
          <span className="block text-[var(--muted)]">Available now</span>
          <span className="tabular-nums text-sm">
            {fundable === undefined ? '—' : fmt(Number(formatUnits(fundable, pool.decimals)), 0)}
          </span>
        </span>
      </span>
    </label>
  );
}

/**
 * The choice of borrow asset is the choice of what the loan costs, and a `<select>` states only the
 * ticker — the one thing the user already knows. Each pool is listed with its rate and with what it
 * can actually fund, because both are properties of the pool being picked rather than of the
 * position, and both are decided here rather than on the screen that comes after.
 */
function BorrowAssetSelect({
  pools,
  value,
  onChange,
  disabled,
}: {
  pools: SubgraphPool[];
  value: string;
  onChange: (v: `0x${string}`) => void;
  disabled?: boolean;
}) {
  // Both deposit cards render one of these, and two radio groups sharing a name would behave as a
  // single one — picking in either would clear the other's selection.
  const group = useId();
  return (
    <fieldset disabled={disabled} className="disabled:opacity-60">
      <legend className="block text-xs text-[var(--muted)] mb-1">Borrow asset</legend>
      {pools.length === 0 ? (
        <p className="text-sm text-[var(--muted)] py-2.5">No lending pools available yet.</p>
      ) : (
        <div className="space-y-1.5">
          {pools.map((p) => (
            <PoolOption
              key={p.id}
              pool={p}
              group={group}
              selected={p.borrowAsset === value}
              onSelect={() => onChange(p.borrowAsset as `0x${string}`)}
            />
          ))}
        </div>
      )}
    </fieldset>
  );
}

const symbolOf = (address: string) => tokenInfo(address).symbol;

/**
 * Picks which of the accepted pairs the deposit will lock.
 *
 * Same reset discipline as useBorrowAssetChoice, for the same reason: the accepted set is read from
 * the chain and can come back different, and a selection that is no longer in it would leave the
 * tab strip with nothing highlighted while the deposit button still pointed at the old pair — a
 * deposit that reverts LP_POOL_NOT_SUPPORTED once the protocol has dropped it.
 */
function useAcceptedPairChoice(accepted: AcceptedPool[]) {
  const [pair, setPair] = useState<`0x${string}` | ''>('');
  useEffect(() => {
    if (!accepted.length) {
      setPair('');
      return;
    }
    if (!accepted.some((p) => p.address === pair)) {
      setPair(accepted[0].address);
    }
  }, [accepted, pair]);
  return {pair, setPair};
}

function V2DepositCard({
  owner,
  pools,
  accepted,
  onDone,
}: {
  owner: `0x${string}`;
  pools: SubgraphPool[];
  accepted: AcceptedPool[];
  onDone: () => void;
}) {
  const [deposited, setDeposited] = useState(false);
  const [depositing, setDepositing] = useState(false);
  const {borrowAsset, setBorrowAsset} = useBorrowAssetChoice(pools);
  const {pair, setPair} = useAcceptedPairChoice(accepted);
  const pairGroup = useId();

  // Every accepted pair's balance, in one batch. The tabs state what the protocol accepts rather
  // than only what the wallet happens to hold, so an unselected pair still needs its balance — that
  // is what tells the user whether switching to it would give them anything.
  const {data: balanceResults, isError: balancesError, refetch: refetchBalances} = useReadContracts({
    contracts: accepted.map((p) => ({
      address: p.address,
      abi: erc20Abi,
      functionName: 'balanceOf' as const,
      args: [owner] as const,
    })),
    query: {enabled: accepted.length > 0},
  });

  // Three states, not two. A balance that could not be read stays undefined rather than becoming
  // zero — zero says the wallet holds none of this pair, which is a claim, and the wrong one to make
  // on a failed read. But a balance that has not arrived yet is also undefined, and that one is not
  // a failure: collapsing the two puts "price unavailable" under every tab for as long as the
  // multicall is in flight, which is the same lie in the other direction.
  const balances = useMemo(
    () =>
      accepted.map((_, i) => {
        const r = balanceResults?.[i];
        if (balancesError || r?.status === 'failure') return {value: undefined, isError: true};
        return {value: r?.result as bigint | undefined, isError: false};
      }),
    [accepted, balanceResults, balancesError],
  );

  // Only pairs the wallet actually holds are sent to the oracle. A zero balance is worth zero by
  // arithmetic, not by assumption, and asking for a price on a zero amount would spend a call to be
  // told so.
  const {pricedPairs, priceQueries} = useMemo(() => {
    const pricedPairs: AcceptedPool[] = [];
    const priceQueries: LpPriceQuery[] = [];
    accepted.forEach((p, i) => {
      const amount = balances[i].value;
      if (amount === undefined || amount === 0n) return;
      pricedPairs.push(p);
      priceQueries.push({lpToken: p.address, tokenId: 0n, amount});
    });
    return {pricedPairs, priceQueries};
  }, [accepted, balances]);

  const prices = useLpUsdValues(LP_TYPE_V2, priceQueries);
  const usdFor = useMemo(() => {
    const byPair = new Map(pricedPairs.map((p, i) => [p.address, prices[i]]));
    return (i: number) => {
      const {value: bal, isError} = balances[i];
      // The price is derived from the balance, so it inherits the balance's state: unreadable if
      // the balance was unreadable, still loading if the balance is still loading.
      if (isError) return {value: undefined, isError: true};
      if (bal === undefined) return {value: undefined, isError: false};
      if (bal === 0n) return {value: 0n, isError: false};
      return byPair.get(accepted[i].address) ?? {value: undefined, isError: false};
    };
  }, [accepted, balances, pricedPairs, prices]);

  const selectedIndex = accepted.findIndex((p) => p.address === pair);
  const selected = selectedIndex >= 0 ? accepted[selectedIndex] : undefined;
  const balance = selectedIndex >= 0 ? balances[selectedIndex].value : undefined;
  const {value: lpUsd, isError: lpUsdError} = selectedIndex >= 0 ? usdFor(selectedIndex) : {value: undefined, isError: false};

  const {data: allowance, isError: allowanceError, refetch: refetchAllowance} = useReadContract({
    address: selected?.address,
    abi: erc20Abi,
    functionName: 'allowance',
    args: selected ? [owner, deployments.v2Adapter] : undefined,
    query: {enabled: !!selected},
  });

  const underlying = useV2Underlying(selected?.address, balance ?? 0n);
  // Both legs or neither: half a composition is not a composition, and the missing half is exactly
  // the token whose amount could not be trusted.
  const composition = useMemo(() => {
    if (!underlying) return undefined;
    const amount0 = formatTokenAmount(underlying.amount0, underlying.token0);
    const amount1 = formatTokenAmount(underlying.amount1, underlying.token1);
    return {amounts: amount0 && amount1 ? `${amount0} + ${amount1}` : undefined};
  }, [underlying]);
  const config = useCollateralConfig(LP_TYPE_V2);
  const capacity = borrowingCapacityUsd(lpUsd, config);
  const unlockBlocks = useBorrowUnlockDelay();
  // Used only to tell the user how many wallet prompts to expect. The button re-reads the allowance
  // at the moment it is clicked and decides for itself, so this figure describes the deposit rather
  // than governing it: a stale one costs the user a surprise, not a reverted transaction.
  //
  // An allowance that could not be read counts as zero rather than as whatever TanStack Query still
  // has cached, which for an errored refetch is the previous block's answer. Zero over-promises a
  // prompt instead of under-promising one — a confirmation that does not appear is a pleasant
  // surprise, one that does is a broken instruction.
  //
  // Three when there is a short but non-zero allowance to clear first, which is the same condition
  // the button resets on. Counting that case as two would be the one direction that misleads:
  // the extra prompt arrives unannounced, and an unexplained wallet request in the middle of a
  // sequence is what a user reads as the app having been compromised.
  const allowanceValue = allowanceError ? 0n : ((allowance as bigint) ?? 0n);
  const confirmations =
    allowanceValue >= (balance ?? 0n) ? 1 : allowanceValue > 0n ? 3 : 2;
  const borrowSymbol = pools.find((p) => p.borrowAsset === borrowAsset)?.symbol;
  const selectedLabel = selected ? pairLabel(selected, symbolOf) : undefined;

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-center gap-3">
        <TokenChip label="V2" color={LP_COLOR} />
        <div>
          <p className="font-semibold leading-tight">Uniswap V2 LP</p>
          <p className="text-xs text-[var(--muted)]">Fungible · pick a pair below</p>
        </div>
      </div>

      {/* Every accepted pair gets a tab, held or not. The section then says what the protocol takes
          rather than what this wallet happens to have, which is the difference between "Koreth does
          not accept WETH/USDT" and "you have no WETH/USDT to deposit" — and the balance is read
          anyway to decide, so stating it costs nothing. */}
      {/* Frozen while a deposit is being served. The pair decides which token is approved and which
          LP is deposited, both captured when the button was clicked — a switch made while the
          wallet is asking would leave the card naming one pair and the prompt naming another. */}
      <fieldset disabled={depositing} className="disabled:opacity-60">
        <legend className="block text-xs text-[var(--muted)] mb-1">Collateral pair</legend>
        <div className="flex flex-wrap gap-1.5">
          {accepted.map((p, i) => {
            const {value, isError} = usdFor(i);
            const isSelected = p.address === pair;
            return (
              <label
                key={p.address}
                // The focusable element is the visually hidden radio, so the ring has to be drawn
                // by the tab around it: without this, tabbing through the group moves an invisible
                // cursor.
                className={`rounded-lg border px-3 py-2 cursor-pointer transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--accent)] ${
                  isSelected
                    ? 'border-[var(--accent)] bg-[var(--accent)]/5'
                    : 'border-[var(--border)] hover:border-[var(--muted)]'
                }`}
              >
                <input
                  type="radio"
                  name={pairGroup}
                  checked={isSelected}
                  onChange={() => setPair(p.address)}
                  className="sr-only"
                />
                <span className="block text-sm font-medium leading-tight">{pairLabel(p, symbolOf)}</span>
                <UsdValue
                  value={value}
                  isError={isError}
                  className="block text-xs text-[var(--muted)] tabular-nums"
                />
              </label>
            );
          })}
        </div>
      </fieldset>

      <BorrowAssetSelect pools={pools} value={borrowAsset} onChange={setBorrowAsset} disabled={depositing} />

      <div className="space-y-3">
        {/* The USD value leads and the pair's two token amounts sit beneath it. The LP count itself
            is not shown: a WETH/USDC balance reads as 0.000084 for a five-figure position, because
            the pair's total supply is the geometric mean of a 6- and an 18-decimal reserve, so the
            one number a user could check against what they deposited looked like dust. */}
        <div>
          <p className="text-xs text-[var(--muted)]">
            Your {selectedLabel ?? 'LP'} balance
          </p>
          <UsdValue value={lpUsd} isError={lpUsdError} className="text-2xl font-semibold tabular-nums" />
          {/* Said in words rather than left as "$0.00". A zero under a tab the user just switched
              to reads as a page still loading; naming the pair says the switch worked and there is
              simply nothing there. */}
          {balance === 0n && selectedLabel && (
            <p className="text-xs text-[var(--muted)]">You hold no {selectedLabel} V2 LP.</p>
          )}
          {/* Named rather than left as a bare pair of amounts. One of these two tickers is very
              often also the ticker of a pool in the selector above, and unlabelled the line reads as
              a statement about the loan: a user who picks DAI and then sees "11,532.69 USDC" under
              their balance has no way to tell that the USDC is a leg of the collateral they are
              locking rather than something about the asset they just chose to borrow. Written with
              "+" for the same reason — "/" is how a pair is named, which is what the header above
              already does, and it invites the two amounts to be read as a ratio. */}
          {composition &&
            (composition.amounts ? (
              <p className="text-xs text-[var(--muted)] tabular-nums">Made up of {composition.amounts}</p>
            ) : (
              // Dropped rather than shown at a guessed scale. This line's whole job is to be
              // checkable against what the user deposited, and a leg printed with the wrong
              // decimals fails at that while looking exactly like one that succeeded.
              <p className="text-xs text-[var(--muted)]">
                What this LP is made of can&apos;t be shown: one of its tokens isn&apos;t recognised.
              </p>
            ))}
        </div>

        <BorrowingCapacity capacity={capacity} isError={lpUsdError} config={config} />

        {/* No amount to choose: the whole balance goes in as one position. withdraw() takes no
            amount and requires the position's debt to be zero, so what a partial deposit would
            really buy is the option to split the LP across positions and exit one of them while
            the other keeps borrowing. That is a portfolio decision, not a deposit-form decision,
            and putting it behind an LP-denominated input — a field that reads 0.000084 for a
            five-figure balance — asks for it in the one unit the user cannot reason about. */}
        <DepositTerms
          collateral="Your whole LP balance goes in as one position."
          borrowSymbol={borrowSymbol}
          confirmations={confirmations}
          delay={unlockBlocks}
        />

        {/* Gated on the RiskManager's own `enabled` flag rather than on the card being rendered:
            the cards come from a subgraph query that can lag the chain, so a collateral type can
            still be offered here after being suspended. An unread config disables the button too —
            the alternative is sending a deposit() the protocol may reject and charging the user gas
            to find out. */}
        <ActionButton
          approve={selected && {token: selected.address, spender: deployments.v2Adapter, amount: balance ?? 0n}}
          address={deployments.positionManager}
          abi={positionManagerAbi}
          functionName="deposit"
          args={[selected?.address, 0n, balance ?? 0n, borrowAsset]}
          label="Deposit full balance"
          onBusyChange={setDepositing}
          // An unread balance disables the button as firmly as a zero one: the whole balance is the
          // deposit amount, so not knowing it means having nothing to send.
          disabled={!selected || balance === undefined || balance === 0n || borrowAsset === '' || !config?.enabled}
          onConfirmed={() => {
            setDeposited(true);
            refetchBalances();
            refetchAllowance();
            onDone();
          }}
        />
        {deposited && <DepositedNote unlockBlocks={unlockBlocks} />}
        <p className="text-xs text-[var(--muted)]">
          Protocol-wide borrow caps may limit you to less than your LTV limit.
        </p>
      </div>
    </div>
  );
}

/**
 * What this collateral's own risk parameters allow, shown before the deposit so the user can
 * decide whether it is worth locking the LP up at all — the question every lending interface
 * answers up front, and the one this page previously answered only after the deposit.
 *
 * The label says LTV because that is all this figure is. RiskManager also enforces a global borrow
 * cap, a per-LP-type cap, a daily borrow-increase window and a maximum position value, any of
 * which can bind first; folding those in means reading protocol-wide state that has nothing to do
 * with this position, so they are named rather than silently ignored.
 */
function BorrowingCapacity({
  capacity,
  isError,
  config,
}: {
  capacity: bigint | undefined;
  isError: boolean;
  config: CollateralConfig | undefined;
}) {
  return (
    <div className="flex items-baseline justify-between rounded-lg border border-[var(--border)] px-3 py-2">
      <div>
        <p className="text-xs text-[var(--muted)]">Your LTV limit</p>
        {config && !config.enabled ? (
          <p className="text-sm text-[var(--muted)]">not accepted as collateral right now</p>
        ) : (
          // Carries the price read's own failure: this figure is derived from it, so a dead oracle
          // has to read as unavailable here too rather than as a number still on its way.
          <UsdValue value={capacity} isError={isError} approx={false} maximumFractionDigits={0} className="text-lg font-semibold tabular-nums" />
        )}
      </div>
      {config?.enabled && (
        <p className="text-xs text-[var(--muted)]">
          {Number(config.maxLtv) / 100}% LTV
          {config.haircut > 0n && ` · ${Number(config.haircut) / 100}% haircut`}
        </p>
      )}
    </div>
  );
}

/**
 * What the deposit commits the user to, stated before the button rather than discovered after it.
 *
 * Everything here was already true and none of it was on the form. The page offered a signature
 * that hands over custody of an LP, fixes the borrow asset permanently, costs one or two wallet
 * confirmations and does not permit a borrow for some blocks afterwards — and said, in grey text
 * beneath the button, only that the LP comes back when the debt is repaid.
 *
 * Ordered by consequence, not by sequence. The borrow asset leads because it is the only choice on
 * this form that cannot be undone without unwinding the whole position, and it is the one the form
 * presented as a mere dropdown.
 */
function DepositTerms({
  collateral,
  borrowSymbol,
  confirmations,
  delay,
}: {
  /** What is handed over, phrased for the collateral type: a whole balance, or one NFT. */
  collateral: string;
  /** Symbol of the pool the position will be bound to, or undefined while none is selected. */
  borrowSymbol: string | undefined;
  /** Wallet prompts this deposit will raise, approval included. */
  confirmations: number;
  /**
   * Blocks between the deposit and the first block that will accept a borrow, or undefined while
   * the figure is unread. Passed in rather than read here so that the delay quoted before the
   * deposit and the one quoted in the note after it come from one read on one card, instead of two
   * observers that agree only for as long as they are configured identically.
   */
  delay: bigint | undefined;
}) {
  return (
    <div className="rounded-lg border border-[var(--border)] px-3 py-2.5 space-y-1.5">
      <p className="text-xs font-medium text-[var(--muted-strong)]">Before you deposit</p>
      <ul className="text-xs text-[var(--muted)] space-y-1">
        {/* Named first and in full. `borrowAsset` is written into the position at deposit and has
            no setter — every later path reads it, none of them assigns it — so switching assets
            means repaying the debt, withdrawing the LP and depositing again. The picker above gives
            no hint that the choice outlives the click. */}
        <li>
          {borrowSymbol === undefined ? (
            'The borrow asset you pick above is fixed for the life of this position. Changing it later means repaying in full, withdrawing, and depositing again.'
          ) : (
            <>
              This position will borrow <span className="text-[var(--foreground)]">{borrowSymbol}</span>{' '}
              and nothing else, for as long as it is open. Changing that means repaying in full,
              withdrawing, and depositing again.
            </>
          )}
        </li>
        <li>{collateral} Koreth holds it until the position&apos;s debt is back to zero.</li>
        <li>
          {confirmations === 1
            ? 'One wallet confirmation.'
            : confirmations === 2
              ? 'Two wallet confirmations, back to back: an approval, then the deposit.'
              : 'Three wallet confirmations, back to back: your current allowance is cleared to zero, ' +
                'set to the deposit amount, then the deposit itself.'}
        </li>
        {/* Stated here rather than only counted down afterwards. The delay is protocol-wide, so it
            is knowable before the deposit that starts it — and a user who expects to borrow in the
            same sitting is owed that before they sign, not as a greyed-out button. */}
        <li>
          {delay === undefined
            ? 'Borrowing unlocks a few blocks after the deposit — a delay that stops a single transaction from moving the LP price and borrowing against it.'
            : `Borrowing unlocks ${delay.toString()} block${delay === 1n ? '' : 's'} after the deposit — a delay that stops a single transaction from moving the LP price and borrowing against it.`}
        </li>
      </ul>
    </div>
  );
}

/**
 * Closes the loop the deposit opens. The position it creates is rendered further down the page,
 * which a user who has just watched a wallet dialog close has no particular reason to look at — so
 * the card that took the LP says where it went, and repeats the one thing standing between the
 * user and the borrow they came for.
 */
function DepositedNote({unlockBlocks}: {unlockBlocks: bigint | undefined}) {
  return (
    <p className="text-xs text-[var(--accent)]">
      ✓ Deposited. Your position is under &ldquo;Your positions&rdquo; below
      {unlockBlocks === undefined
        ? ', where borrowing unlocks once the deposit cooldown has passed.'
        : `, where borrowing unlocks ${unlockBlocks.toString()} block${unlockBlocks === 1n ? '' : 's'} after the deposit.`}
    </p>
  );
}

function V3DepositCard({
  owner,
  pools,
  accepted,
  onDone,
}: {
  owner: `0x${string}`;
  pools: SubgraphPool[];
  accepted: AcceptedPool[];
  onDone: () => void;
}) {
  const [deposited, setDeposited] = useState(false);
  const {borrowAsset, setBorrowAsset} = useBorrowAssetChoice(pools);
  const {
    positions: owned,
    isLoading: ownedLoading,
    isError: ownedError,
    refetch: refetchCount,
  } = useOwnedV3Positions(owner);

  // Kept rather than filtered away, because the two are different sentences: an NFT in a pool the
  // protocol does not take is not a wallet with nothing in it, and saying so is what stops a user
  // hunting for a position that is on screen in Uniswap and missing here.
  const eligible = useMemo(
    () => owned.filter((p) => isAcceptedV3Position(accepted, p.token0, p.token1, p.fee)),
    [owned, accepted],
  );
  const ineligibleCount = owned.length - eligible.length;

  const {data: approvedAll, refetch: refetchApproval} = useReadContract({
    address: V3_NFT_MANAGER,
    abi: nftManagerAbi,
    functionName: 'isApprovedForAll',
    args: [owner, deployments.v3Adapter],
  });

  // The V3 oracle keys off the NFT manager address and tokenId, so amount is passed as 0.
  const priceQueries = useMemo<LpPriceQuery[]>(
    () => eligible.map(({id}) => ({lpToken: V3_NFT_MANAGER, tokenId: id, amount: 0n})),
    [eligible],
  );
  const prices = useLpUsdValues(LP_TYPE_V3, priceQueries);
  // One config for every row: the risk parameters are per LP type, not per NFT.
  const config = useCollateralConfig(LP_TYPE_V3);
  const unlockBlocks = useBorrowUnlockDelay();
  const borrowSymbol = pools.find((p) => p.borrowAsset === borrowAsset)?.symbol;

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-center gap-3">
        <TokenChip label="V3" color={LP_COLOR} />
        <div>
          <p className="font-semibold leading-tight">Uniswap V3 position</p>
          {/* The accepted pairs are named here rather than under each row: a wallet holding none of
              them would otherwise be told only that it has nothing eligible, without ever being
              told what eligible means. */}
          <p className="text-xs text-[var(--muted)]">
            NFT · {accepted.map((p) => pairLabel(p, symbolOf)).join(', ')}
          </p>
        </div>
      </div>

      <BorrowAssetSelect pools={pools} value={borrowAsset} onChange={setBorrowAsset} />

      {eligible.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">
          {ownedLoading
            ? 'Loading your V3 positions…'
            : ownedError
              ? 'Your V3 positions could not be read.'
              : ineligibleCount > 0
                ? `None of your ${ineligibleCount} V3 position${ineligibleCount === 1 ? ' is' : 's are'} in a pool the protocol accepts.`
                : 'No eligible V3 positions — get one from the Faucet.'}
        </p>
      ) : (
        <div className="space-y-3">
          {config && !config.enabled && (
            <p className="text-sm text-[var(--muted)]">
              V3 positions are not accepted as collateral right now.
            </p>
          )}
          {/* Approval is a gate on the Deposit action, not on seeing the list: the positions are
              shown first so the user can review which NFTs they'll be depositing before granting
              custody. Deposit buttons stay disabled until the one-time approval is confirmed. */}
          {!approvedAll && (
            <div className="rounded-lg border border-[var(--border)] p-3 space-y-2">
              <p className="text-sm text-[var(--muted-strong)]">
                One-time approval to let Koreth custody your V3 NFTs. Review your positions below first.
              </p>
              <TxButton
                address={V3_NFT_MANAGER}
                abi={nftManagerAbi}
                functionName="setApprovalForAll"
                args={[deployments.v3Adapter, true]}
                label="Approve V3 positions"
                onConfirmed={() => refetchApproval()}
              />
            </div>
          )}
          {/* One confirmation, not two: the NFT approval is its own visible step above rather than
              a leg folded into the button, so by the time a Deposit is clickable it has already
              been given. */}
          <DepositTerms
            collateral="The position you choose below goes in on its own."
            borrowSymbol={borrowSymbol}
            confirmations={1}
            delay={unlockBlocks}
          />
          <div>
            {eligible.map(({id, token0, token1, fee, tickLower, tickUpper}, i) => {
              const {value: rowValue, isError: rowError} = prices[i];
              return (
              <div key={id.toString()} className="flex items-center justify-between border-t border-[var(--border)] pt-3 mt-3 first:border-0 first:pt-0 first:mt-0">
                <div>
                  <p className="text-sm leading-tight font-semibold">
                    {tokenInfo(token0).symbol}/{tokenInfo(token1).symbol} · V3 #{id.toString()}
                  </p>
                  <p className="text-sm leading-tight">
                    <UsdValue value={rowValue} isError={rowError} />
                  </p>
                  {/* The pair, fee tier and range all come out of the positions() call already made
                      to filter the list, so this costs no extra reads. Whether the range is
                      currently in play is deliberately not shown: that needs the pool's spot tick,
                      the manipulable figure the protocol's own oracle refuses to price from. */}
                  <p className="text-xs text-[var(--muted)]">
                    {fee / 10_000}% fee · {isFullRange(tickLower, tickUpper) ? 'full range' : 'concentrated range'}
                  </p>
                  <p className="text-xs text-[var(--muted)]">
                    LTV limit{' '}
                    <UsdValue
                      value={borrowingCapacityUsd(rowValue, config)}
                      isError={rowError}
                      approx={false}
                      maximumFractionDigits={0}
                    />
                  </p>
                </div>
                <TxButton
                  address={deployments.positionManager}
                  abi={positionManagerAbi}
                  functionName="deposit"
                  args={[V3_NFT_MANAGER, id, 0n, borrowAsset]}
                  label="Deposit"
                  disabled={borrowAsset === '' || !approvedAll || !config?.enabled}
                  onConfirmed={() => {
                    setDeposited(true);
                    refetchCount();
                    onDone();
                  }}
                />
              </div>
              );
            })}
          </div>
          {/* The oracle values liquidity only — UniswapV3Oracle reports feeValue as zero by
              design, since uncollected fees are swept to the borrower at liquidation rather than
              seized. A user comparing this figure with Uniswap's, which does include them, would
              otherwise have no way to account for the gap. */}
          {deposited && <DepositedNote unlockBlocks={unlockBlocks} />}
          <p className="text-xs text-[var(--muted)]">
            Values cover your liquidity only. Uncollected fees stay yours and are not counted as
            collateral. Protocol-wide borrow caps may limit you to less than your LTV limit.
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * How many blocks must pass after the deposit block before borrow() will accept a draw.
 *
 * borrow() requires `block.number > depositBlock + borrowCooldownBlocks`: an anti-manipulation
 * delay that makes depositing and borrowing in the same block impossible. Until it elapses the
 * Borrow button reverted BORROW_COOLDOWN with nothing on screen to explain the failure, which
 * reads as a broken protocol rather than as a deliberate wait.
 *
 * That comparison is strict, so the first block satisfying it is one past the sum: the wait is one
 * block longer than the configured figure. Derived here rather than at each call site so the delay
 * quoted on the deposit form and the one counted down on the position card cannot disagree by that
 * block.
 *
 * Read without a position, because the figure is protocol-wide: that is what lets the deposit form
 * state the delay before the deposit that starts it, rather than leaving it to be discovered as a
 * disabled button afterwards.
 */
function useBorrowUnlockDelay(): bigint | undefined {
  const {data, isError} = useReadContract({address: deployments.lendingEngine, abi: lendingEngineAbi, functionName: 'borrowCooldownBlocks'});
  if (isError || data === undefined) return undefined;
  return (data as bigint) + 1n;
}

/**
 * Where a position stands against that delay. `ready` is false while any of the reads is still in
 * flight — an unknown cooldown is treated as not elapsed, so the button is never enabled on an
 * assumption. `blocksLeft` is undefined in exactly that case, which the card reports rather than
 * showing a button that is disabled for no stated reason.
 */
function useBorrowCooldown(depositBlock: bigint | undefined): {ready: boolean; blocksLeft: bigint | undefined} {
  const delay = useBorrowUnlockDelay();
  const {data: blockNumber} = useBlockNumber({watch: true});

  if (depositBlock === undefined || delay === undefined || blockNumber === undefined) {
    return {ready: false, blocksLeft: undefined};
  }
  const readyAt = depositBlock + delay;
  if (blockNumber >= readyAt) return {ready: true, blocksLeft: 0n};
  return {ready: false, blocksLeft: readyAt - blockNumber};
}

function PositionBorrowCard({position, onDone}: {position: SubgraphPosition; onDone: () => void}) {
  const [amount, setAmount] = useState('');
  const [ackRisk, setAckRisk] = useState(false);
  const id = BigInt(position.id);
  const {symbol, decimals} = position.pool;
  const summary = usePositionSummary(
    id,
    position.pool.address as `0x${string}`,
    position.pool.borrowAsset as `0x${string}`,
  );
  const {debt, capacity, config, position: pos, fromCapacity, liquidityCap, available, liquidityBound} = summary;
  const cooldown = useBorrowCooldown(pos?.depositBlock);

  const parsed = parseAmount(amount, decimals);
  const projected =
    parsed > 0n && debt !== undefined ? projectedHealthFactor(debt + parsed, capacity, config) : undefined;
  // Borrowing is capped at maxLtv, so no single borrow can push the health factor to the
  // liquidation line — what it does is decide how far the LP can fall before it gets there.
  // Below this the drop that would liquidate the position is small enough to be worth an explicit
  // acknowledgement rather than a colour change, the pattern Aave uses for the same decision.
  const needsAck = projected !== undefined && projected < RISK_ACK_HEALTH_FACTOR;
  // The acknowledgement is about one projected health factor, so changing the amount withdraws it
  // — otherwise a user who accepts 1.4 on a small borrow carries that consent into a larger one
  // they never looked at. It deliberately survives the projection moving on its own as prices
  // update, since a checkbox that cleared itself every block would be impossible to tick.
  const setAmountAndReack = (next: string) => {
    setAmount(next);
    setAckRisk(false);
  };
  // An amount whose consequence cannot be shown cannot be acknowledged either, so it blocks the
  // borrow rather than skipping the gate: `needsAck` is false both when the borrow is safe and
  // when the risk parameters have not been read, and only one of those should let the user sign.
  // borrow() also rejects a position that no longer holds its LP and any draw against a collateral
  // type that has since been disabled — getMaxBorrow keeps pricing the stored LP through both, so
  // the amount can look drawable right up to the revert.
  const borrowable = isOpenOnChain(pos) === true && config?.enabled === true;
  const valid =
    borrowable && parsed > 0n && available !== undefined && parsed <= available && projected !== undefined;

  return (
    <div className="card card-hover p-5 space-y-4">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <TokenChip label={symbol} />
          <div>
            {/* "Position #3" says nothing about what is actually locked up. A user with several
                positions tells them apart by the pair and, for V3, by the NFT they minted. */}
            <p className="font-semibold leading-tight">{positionTitle(pos, position.id)}</p>
            <p className="text-xs text-[var(--muted)]">Position #{position.id} · borrow {symbol}</p>
          </div>
        </div>
        {/* The projection is passed whenever an amount is being prepared, including when it could
            not be computed: the readout distinguishes the two, and showing the current distance
            under a typed amount would describe the position the user is leaving rather than the
            one they are about to take on. */}
        <HealthReadout
          current={summary.healthFactor}
          projected={parsed > 0n ? {value: projected} : undefined}
        />
      </div>

      <PositionStats summary={summary} symbol={symbol} decimals={decimals} />

      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-[var(--muted)]">
          <span>Borrow {symbol}</span>
          <button
            onClick={() => available !== undefined && setAmountAndReack(formatUnits(available, decimals))}
            disabled={available === undefined}
            className="hover:text-[var(--foreground)] disabled:opacity-40"
          >
            Max
          </button>
        </div>
        {needsAck && (
          <label className="flex items-start gap-2 rounded-lg border border-[var(--warning)]/40 p-3 text-xs text-[var(--muted-strong)]">
            <input type="checkbox" checked={ackRisk} onChange={(e) => setAckRisk(e.target.checked)} className="mt-0.5" />
            <span>
              This leaves little room before liquidation: a fall in the value of your LP would put
              the position below 1.00 and let anyone repay your debt in exchange for the collateral.
              I understand the risk.
            </span>
          </label>
        )}
        <div className="flex gap-2">
          <input value={amount} onChange={(e) => setAmountAndReack(e.target.value)} placeholder="0.0" inputMode="decimal" className="input flex-1 p-2.5" />
          <TxButton
            address={deployments.lendingEngine}
            abi={lendingEngineAbi}
            functionName="borrow"
            args={[id, parsed]}
            label="Borrow"
            disabled={!valid || !cooldown.ready || (needsAck && !ackRisk)}
            onConfirmed={() => {
              setAmount('');
              setAckRisk(false);
              summary.refetch();
              onDone();
            }}
          />
        </div>
        {/* Nothing is said when the collateral is the binding constraint and there is still room to
            draw: that is the ordinary case, and `Available` next to the health factor already
            describes it. The two situations worth a sentence are the ones that end in a disabled
            button, where the user is owed the reason, and the pool running dry, which is the bound
            nothing else on the card hints at. */}
        {available === 0n ? (
          <p className="text-xs text-[var(--muted-strong)]">
            {/* Both bounds are reported when both are spent, rather than letting the tie fall to
                one of them: "deposit more collateral" is advice that does nothing against a pool
                with nothing to lend, and the user would follow it and find the button still dead. */}
            {fromCapacity === 0n && liquidityCap === 0n
              ? 'Nothing can be drawn right now: this collateral is at the limit it can safely support, and the pool has no cash left to lend. Depositing more collateral raises the first; the pool refills as loans are repaid.'
              : fromCapacity === 0n
                ? 'This collateral is at the limit it can safely support. Repaying debt, or depositing more collateral, raises it.'
                : 'This pool has lent out all of its cash, so nothing can be drawn right now regardless of your collateral. It refills as loans are repaid.'}
          </p>
        ) : liquidityBound ? (
          <p className="text-xs text-[var(--muted-strong)]">
            Limited by the cash left in this pool rather than by your collateral. More becomes
            available as loans are repaid.
          </p>
        ) : null}
        {/* Both ways the cooldown holds the button down are stated. It is not enough to report the
            countdown: `ready` is also false while the reads behind it are in flight, and that case
            used to render nothing at all — a disabled Borrow button with every figure above it
            looking healthy, which is indistinguishable from a broken page. */}
        {!cooldown.ready && (
          <p className="text-xs text-[var(--muted)]">
            {cooldown.blocksLeft === undefined
              ? 'Checking how long is left of the deposit cooldown — borrowing stays locked until that is known.'
              : `Borrowing unlocks in ${cooldown.blocksLeft.toString()} block${cooldown.blocksLeft === 1n ? '' : 's'} — a short delay after each deposit that stops a single transaction from moving the price and borrowing against it.`}
          </p>
        )}
      </div>
    </div>
  );
}
