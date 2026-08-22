'use client';

import {useEffect, useMemo, useState} from 'react';
import {useAccount, useReadContract, useReadContracts} from 'wagmi';
import {erc20Abi, formatUnits, parseUnits} from 'viem';
import {deployments} from '@/generated/deployments';
import {positionManagerAbi, lendingEngineAbi, lpOracleHubAbi} from '@/generated/abis';
import {useCollateralTypes, useSubgraphPools, useSubgraphPositions} from '@/hooks/useSubgraph';
import type {SubgraphPool, SubgraphPosition} from '@/lib/subgraph';
import {TxButton} from '@/components/TxButton';
import {ActionButton} from '@/components/ActionButton';
import {TokenChip} from '@/components/TokenChip';
import {tokenInfo} from '@/lib/tokens';
import {V3_NFT_MANAGER, V3_FEE, nftManagerAbi} from '@/lib/v3';

const LP_DECIMALS = 18;
const LP_COLOR = '#8b93ff';

// Quote tokens whose WETH V3 pool is whitelisted as collateral on-chain. Only pairs listed here are
// shown as depositable: deposit() reverts COLLATERAL_NOT_ENABLED for a pool ProtocolCore hasn't
// whitelisted, so this list must track the on-chain whitelist. To add WETH/DAI or WETH/USDT, first
// whitelist their pools in ProtocolCore AND register their USD feeds in PriceFeedRegistry, then add
// the token address here (e.g. deployments.dai, deployments.usdt).
const V3_ELIGIBLE_QUOTES: string[] = [deployments.usdc.toLowerCase()];

// A V3 NFT is depositable when it is a WETH/<eligible-quote> pool at the whitelisted fee tier.
// Uniswap orders token0 < token1 by address, so WETH can be on either side.
function isEligibleV3Pair(token0: string, token1: string, fee: number): boolean {
  if (fee !== V3_FEE) return false;
  const weth = deployments.weth.toLowerCase();
  const a = token0.toLowerCase();
  const b = token1.toLowerCase();
  if (a !== weth && b !== weth) return false;
  return V3_ELIGIBLE_QUOTES.includes(a === weth ? b : a);
}

// ILPAdapter.LPType, the discriminator LPOracleHub routes on to pick the per-protocol oracle.
const LP_TYPE_V2 = 0;
const LP_TYPE_V3 = 1;

// LPOracleHub prices in USD with 18 decimals, regardless of the collateral's own decimals.
const USD_DECIMALS = 18;

// The hub is read off PositionManager rather than from deployments.json so the price shown is by
// construction the one the protocol will use: PositionManager.getPositionValue asks this same hub,
// and getHealthFactor is computed from that. A hub address configured separately in the frontend
// could drift from the one the contracts actually consult.
function useOracleHub(): `0x${string}` | undefined {
  const {data} = useReadContract({address: deployments.positionManager, abi: positionManagerAbi, functionName: 'oracleHub'});
  return data as `0x${string}` | undefined;
}

// getRawPrice takes the amount as an argument instead of reading a stored position, which is what
// lets it value collateral that is still in the wallet — PositionManager.getPositionValue only
// works once a position exists. tokenId is ignored for V2, amount is ignored for V3.
function useLpUsdValue(lpToken: `0x${string}` | undefined, tokenId: bigint, amount: bigint, lpType: number) {
  const hub = useOracleHub();
  const {data, isError} = useReadContract({
    address: hub,
    abi: lpOracleHubAbi,
    functionName: 'getRawPrice',
    args: lpToken ? [lpToken, tokenId, amount, lpType] : undefined,
    query: {enabled: !!hub && !!lpToken && (lpType === LP_TYPE_V3 || amount > 0n)},
  });
  return {value: data as bigint | undefined, isError};
}

function formatUsd(v: bigint): string {
  return `$${fmt(Number(formatUnits(v, USD_DECIMALS)))}`;
}

// The oracle reverts instead of returning a stale figure when a Chainlink feed is down, so a failed
// read is rendered as unavailable. Substituting a fallback — spot reserves, or zero — would state a
// collateral value the protocol would refuse to credit.
function UsdValue({value, isError, className = ''}: {value: bigint | undefined; isError: boolean; className?: string}) {
  if (isError) return <span className={`text-[var(--muted)] ${className}`}>price unavailable</span>;
  if (value === undefined) return <span className={`text-[var(--muted)] ${className}`}>—</span>;
  return <span className={className}>≈ {formatUsd(value)}</span>;
}

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

function formatHealth(hf: bigint | undefined): string {
  if (hf === undefined) return '—';
  if (hf > 10n ** 30n) return '∞';
  return Number(formatUnits(hf, 18)).toFixed(2);
}
function healthColor(hf: bigint | undefined): string {
  if (hf === undefined || hf > 10n ** 30n) return 'text-[var(--accent)]';
  const v = Number(formatUnits(hf, 18));
  if (v < 1.1) return 'text-[var(--danger)]';
  if (v < 1.5) return 'text-[var(--warning)]';
  return 'text-[var(--accent)]';
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
            {loadingCollateral ? (
              <div className="card p-10 text-center text-[var(--muted)]">Loading…</div>
            ) : enabled.size === 0 ? (
              <div className="card p-10 text-center text-[var(--muted)]">
                No collateral types are currently accepted.
              </div>
            ) : (
              <div className="grid lg:grid-cols-2 gap-4">
                {enabled.has('UniswapV2') && (
                  <DepositV2Card owner={address!} pools={poolList} onDone={() => refetchPositions()} />
                )}
                {enabled.has('UniswapV3') && (
                  <V3DepositCard owner={address!} pools={poolList} onDone={() => refetchPositions()} />
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

function BorrowAssetSelect({
  pools,
  value,
  onChange,
}: {
  pools: SubgraphPool[];
  value: string;
  onChange: (v: `0x${string}`) => void;
}) {
  return (
    <div>
      <label className="block text-xs text-[var(--muted)] mb-1">Borrow asset</label>
      {pools.length === 0 ? (
        <p className="text-sm text-[var(--muted)] py-2.5">No lending pools available yet.</p>
      ) : (
        <select value={value} onChange={(e) => onChange(e.target.value as `0x${string}`)} className="input w-full p-2.5">
          {pools.map((p) => (
            <option key={p.id} value={p.borrowAsset}>
              Borrow {p.symbol}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

function DepositV2Card({
  owner,
  pools,
  onDone,
}: {
  owner: `0x${string}`;
  pools: SubgraphPool[];
  onDone: () => void;
}) {
  const [amount, setAmount] = useState('');
  const {borrowAsset, setBorrowAsset} = useBorrowAssetChoice(pools);

  const {data: lpBalance, refetch: refetchBalance} = useReadContract({address: deployments.v2Pair, abi: erc20Abi, functionName: 'balanceOf', args: [owner]});
  const {data: allowance, refetch: refetchAllowance} = useReadContract({address: deployments.v2Pair, abi: erc20Abi, functionName: 'allowance', args: [owner, deployments.v2Adapter]});

  const parsed = parseAmount(amount, LP_DECIMALS);
  const balance = (lpBalance as bigint) ?? 0n;
  const valid = parsed > 0n && parsed <= balance && borrowAsset !== '';
  const {value: lpUsd, isError: lpUsdError} = useLpUsdValue(deployments.v2Pair, 0n, balance, LP_TYPE_V2);

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-center gap-3">
        <TokenChip label="V2" color={LP_COLOR} />
        <div>
          <p className="font-semibold leading-tight">Uniswap V2 LP</p>
          <p className="text-xs text-[var(--muted)]">WETH/USDC · fungible</p>
        </div>
      </div>

      <BorrowAssetSelect pools={pools} value={borrowAsset} onChange={setBorrowAsset} />

      <div className="space-y-2">
        {/* The raw LP count leads with its USD value and is demoted to the line below. A WETH/USDC
            LP balance reads as ~0.000086 because the pair's total supply is the geometric mean of a
            6- and an 18-decimal reserve, so a five-figure position looks like dust. Max still fills
            the input with the full-precision balance: rounding it would strand the remainder. */}
        <div className="flex items-center justify-between text-xs text-[var(--muted)]">
          <span>LP balance</span>
          <UsdValue value={lpUsd} isError={lpUsdError} className="text-sm text-[var(--foreground)]" />
        </div>
        <div className="flex justify-end text-xs text-[var(--muted)]">
          <button onClick={() => setAmount(formatUnits(balance, LP_DECIMALS))} className="hover:text-[var(--foreground)]">
            {Number(formatUnits(balance, LP_DECIMALS)).toFixed(6)} LP · Max
          </button>
        </div>
        <div className="flex gap-2">
          <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.0" inputMode="decimal" className="input flex-1 p-2.5" />
          <ActionButton
            approve={{token: deployments.v2Pair, spender: deployments.v2Adapter, amount: parsed, allowance: (allowance as bigint) ?? 0n}}
            address={deployments.positionManager}
            abi={positionManagerAbi}
            functionName="deposit"
            args={[deployments.v2Pair, 0n, parsed, borrowAsset]}
            label="Deposit"
            disabled={!valid}
            onConfirmed={() => {
              setAmount('');
              refetchBalance();
              refetchAllowance();
              onDone();
            }}
          />
        </div>
      </div>
    </div>
  );
}

// viem decodes a multi-output function (positions() has 12 outputs) as a positional
// tuple, not an object — so we index it rather than accessing named fields.
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

function V3DepositCard({owner, pools, onDone}: {owner: `0x${string}`; pools: SubgraphPool[]; onDone: () => void}) {
  const {borrowAsset, setBorrowAsset} = useBorrowAssetChoice(pools);
  const {data: nftCount, refetch: refetchCount} = useReadContract({address: V3_NFT_MANAGER, abi: nftManagerAbi, functionName: 'balanceOf', args: [owner]});
  const n = Number((nftCount as bigint) ?? 0n);

  const {data: idResults} = useReadContracts({
    contracts: Array.from({length: n}, (_, i) => ({
      address: V3_NFT_MANAGER,
      abi: nftManagerAbi,
      functionName: 'tokenOfOwnerByIndex' as const,
      args: [owner, BigInt(i)] as const,
    })),
    query: {enabled: n > 0},
  });
  const tokenIds = (idResults ?? []).map((r) => r.result as bigint).filter((x) => x !== undefined);

  const {data: posResults} = useReadContracts({
    contracts: tokenIds.map((id) => ({
      address: V3_NFT_MANAGER,
      abi: nftManagerAbi,
      functionName: 'positions' as const,
      args: [id] as const,
    })),
    query: {enabled: tokenIds.length > 0},
  });
  const eligible = tokenIds
    .map((id, i) => ({id, p: posResults?.[i]?.result as V3PositionResult | undefined}))
    .filter((e): e is {id: bigint; p: V3PositionResult} => {
      if (!e.p) return false;
      const [, , token0, token1, fee, , , liquidity] = e.p;
      return isEligibleV3Pair(token0, token1, Number(fee)) && liquidity > 0n;
    })
    .map(({id, p}) => ({id, token0: p[2], token1: p[3]}));

  const {data: approvedAll, refetch: refetchApproval} = useReadContract({
    address: V3_NFT_MANAGER,
    abi: nftManagerAbi,
    functionName: 'isApprovedForAll',
    args: [owner, deployments.v3Adapter],
  });

  // Batched rather than one useLpUsdValue per row: the rows are rendered from a single list, and a
  // hook per row would both multiply the RPC round-trips and make the count vary between renders.
  // The V3 oracle keys off the NFT manager address and tokenId, so amount is passed as 0.
  const hub = useOracleHub();
  const {data: valueResults} = useReadContracts({
    contracts: hub
      ? eligible.map(({id}) => ({
          address: hub,
          abi: lpOracleHubAbi,
          functionName: 'getRawPrice' as const,
          args: [V3_NFT_MANAGER, id, 0n, LP_TYPE_V3] as const,
        }))
      : [],
    query: {enabled: !!hub && eligible.length > 0},
  });

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-center gap-3">
        <TokenChip label="V3" color={LP_COLOR} />
        <div>
          <p className="font-semibold leading-tight">Uniswap V3 position</p>
          <p className="text-xs text-[var(--muted)]">WETH/USDC · NFT</p>
        </div>
      </div>

      <BorrowAssetSelect pools={pools} value={borrowAsset} onChange={setBorrowAsset} />

      {eligible.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">No eligible V3 positions — get one from the Faucet.</p>
      ) : (
        <div className="space-y-3">
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
          <div>
            {eligible.map(({id, token0, token1}, i) => (
              <div key={id.toString()} className="flex items-center justify-between border-t border-[var(--border)] pt-3 mt-3 first:border-0 first:pt-0 first:mt-0">
                <div>
                  <p className="text-sm leading-tight">
                    <UsdValue value={valueResults?.[i]?.result as bigint | undefined} isError={valueResults?.[i]?.status === 'failure'} />
                  </p>
                  <p className="text-xs text-[var(--muted)]">
                    NFT #{id.toString()} · {tokenInfo(token0).symbol}/{tokenInfo(token1).symbol}
                  </p>
                </div>
                <TxButton
                  address={deployments.positionManager}
                  abi={positionManagerAbi}
                  functionName="deposit"
                  args={[V3_NFT_MANAGER, id, 0n, borrowAsset]}
                  label="Deposit"
                  disabled={borrowAsset === '' || !approvedAll}
                  onConfirmed={() => {
                    refetchCount();
                    onDone();
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PositionBorrowCard({position, onDone}: {position: SubgraphPosition; onDone: () => void}) {
  const [amount, setAmount] = useState('');
  const id = BigInt(position.id);
  const {symbol, decimals} = position.pool;

  const {data: debt, refetch: refetchDebt} = useReadContract({address: deployments.lendingEngine, abi: lendingEngineAbi, functionName: 'getDebt', args: [id]});
  const {data: health, refetch: refetchHealth} = useReadContract({address: deployments.positionManager, abi: positionManagerAbi, functionName: 'getHealthFactor', args: [id]});
  const {data: maxBorrow, refetch: refetchMax} = useReadContract({address: deployments.lendingEngine, abi: lendingEngineAbi, functionName: 'getMaxBorrow', args: [id]});

  const debtBn = (debt as bigint) ?? 0n;
  // getMaxBorrow is the position's total borrowing capacity, and borrow() checks
  // `currentDebt + amount <= maxBorrow`. Showing it raw as "Available" made the Max button
  // always revert EXCEEDS_MAX_LTV on any position that already had debt.
  const capacity = (maxBorrow as bigint) ?? 0n;
  const available = capacity > debtBn ? capacity - debtBn : 0n;
  const parsed = parseAmount(amount, decimals);
  const valid = parsed > 0n && parsed <= available;
  const hf = health as bigint | undefined;

  return (
    <div className="card card-hover p-5 space-y-4">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <TokenChip label={symbol} />
          <div>
            <p className="font-semibold leading-tight">Position #{position.id}</p>
            <p className="text-xs text-[var(--muted)]">{position.lpType} · borrow {symbol}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs text-[var(--muted)]">Health</p>
          <p className={`text-xl font-semibold tabular-nums leading-tight ${healthColor(hf)}`}>{formatHealth(hf)}</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-sm border-y border-[var(--border)] py-3">
        <div>
          <p className="text-[var(--muted)] text-xs">Collateral</p>
          <p className="tabular-nums">${fmt(Number(position.depositValue), 0)}</p>
        </div>
        <div>
          <p className="text-[var(--muted)] text-xs">Debt</p>
          <p className="tabular-nums">{fmt(Number(formatUnits(debtBn, decimals)))}</p>
        </div>
        <div>
          <p className="text-[var(--muted)] text-xs">Available</p>
          <p className="tabular-nums">{fmt(Number(formatUnits(available, decimals)))}</p>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-[var(--muted)]">
          <span>Borrow {symbol}</span>
          <button onClick={() => setAmount(formatUnits(available, decimals))} className="hover:text-[var(--foreground)]">Max</button>
        </div>
        <div className="flex gap-2">
          <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.0" inputMode="decimal" className="input flex-1 p-2.5" />
          <TxButton
            address={deployments.lendingEngine}
            abi={lendingEngineAbi}
            functionName="borrow"
            args={[id, parsed]}
            label="Borrow"
            disabled={!valid}
            onConfirmed={() => {
              setAmount('');
              refetchDebt();
              refetchHealth();
              refetchMax();
              onDone();
            }}
          />
        </div>
      </div>
    </div>
  );
}
