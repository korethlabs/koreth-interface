'use client';

import {useEffect, useMemo, useState} from 'react';
import {useAccount, useReadContract, useReadContracts} from 'wagmi';
import {erc20Abi, formatUnits, parseUnits} from 'viem';
import {deployments} from '@/generated/deployments';
import {positionManagerAbi, lendingEngineAbi} from '@/generated/abis';
import {useSubgraphMarkets, useSubgraphPositions} from '@/hooks/useSubgraph';
import type {SubgraphPosition} from '@/lib/subgraph';
import {tokenInfo} from '@/lib/tokens';
import {TxButton} from '@/components/TxButton';
import {ActionButton} from '@/components/ActionButton';
import {TokenChip} from '@/components/TokenChip';
import {V3_NFT_MANAGER, V3_FEE, nftManagerAbi} from '@/lib/v3';

const LP_DECIMALS = 18;
const LP_COLOR = '#8b93ff';

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
  const {data: markets} = useSubgraphMarkets();
  const {data: positions, refetch: refetchPositions} = useSubgraphPositions(address);

  const v2Markets = useMemo(() => (markets ?? []).filter((m) => m.lpType === 'UniswapV2'), [markets]);
  const v3Market = useMemo(() => (markets ?? []).find((m) => m.lpType === 'UniswapV3'), [markets]);

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
            <div className="grid lg:grid-cols-2 gap-4">
              <DepositV2Card owner={address!} v2Markets={v2Markets} onDone={() => refetchPositions()} />
              {v3Market && <V3DepositCard owner={address!} marketId={v3Market.id} onDone={() => refetchPositions()} />}
            </div>
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

function DepositV2Card({
  owner,
  v2Markets,
  onDone,
}: {
  owner: `0x${string}`;
  v2Markets: {id: string; borrowAsset: string}[];
  onDone: () => void;
}) {
  const [amount, setAmount] = useState('');
  const [marketId, setMarketId] = useState('');

  useEffect(() => {
    if (!marketId && v2Markets.length) setMarketId(v2Markets[0].id);
  }, [v2Markets, marketId]);

  const {data: lpBalance, refetch: refetchBalance} = useReadContract({address: deployments.v2Pair, abi: erc20Abi, functionName: 'balanceOf', args: [owner]});
  const {data: allowance, refetch: refetchAllowance} = useReadContract({address: deployments.v2Pair, abi: erc20Abi, functionName: 'allowance', args: [owner, deployments.v2Adapter]});

  const parsed = parseAmount(amount, LP_DECIMALS);
  const balance = (lpBalance as bigint) ?? 0n;
  const valid = parsed > 0n && parsed <= balance && marketId !== '';

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-center gap-3">
        <TokenChip label="V2" color={LP_COLOR} />
        <div>
          <p className="font-semibold leading-tight">Uniswap V2 LP</p>
          <p className="text-xs text-[var(--muted)]">WETH/USDC · fungible</p>
        </div>
      </div>

      <div>
        <label className="block text-xs text-[var(--muted)] mb-1">Borrow market</label>
        <select value={marketId} onChange={(e) => setMarketId(e.target.value)} className="input w-full p-2.5">
          {v2Markets.map((m) => (
            <option key={m.id} value={m.id}>
              Borrow {tokenInfo(m.borrowAsset).symbol} (market #{m.id})
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-[var(--muted)]">
          <span>LP balance</span>
          <button onClick={() => setAmount(formatUnits(balance, LP_DECIMALS))} className="hover:text-[var(--foreground)]">
            {Number(formatUnits(balance, LP_DECIMALS)).toFixed(6)} · Max
          </button>
        </div>
        <div className="flex gap-2">
          <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.0" inputMode="decimal" className="input flex-1 p-2.5" />
          <ActionButton
            approve={{token: deployments.v2Pair, spender: deployments.v2Adapter, amount: parsed, allowance: (allowance as bigint) ?? 0n}}
            address={deployments.positionManager}
            abi={positionManagerAbi}
            functionName="deposit"
            args={[deployments.v2Pair, 0n, parsed, BigInt(marketId || '0')]}
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

function V3DepositCard({owner, marketId, onDone}: {owner: `0x${string}`; marketId: string; onDone: () => void}) {
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
  const eligible = tokenIds.filter((_, i) => {
    const p = posResults?.[i]?.result as V3PositionResult | undefined;
    if (!p) return false;
    const [, , token0, token1, fee, , , liquidity] = p;
    return (
      token0?.toLowerCase() === deployments.usdc.toLowerCase() &&
      token1?.toLowerCase() === deployments.weth.toLowerCase() &&
      Number(fee) === V3_FEE &&
      liquidity > 0n
    );
  });

  const {data: approvedAll, refetch: refetchApproval} = useReadContract({
    address: V3_NFT_MANAGER,
    abi: nftManagerAbi,
    functionName: 'isApprovedForAll',
    args: [owner, deployments.v3Adapter],
  });

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-center gap-3">
        <TokenChip label="V3" color={LP_COLOR} />
        <div>
          <p className="font-semibold leading-tight">Uniswap V3 position</p>
          <p className="text-xs text-[var(--muted)]">WETH/USDC · NFT · borrow USDC</p>
        </div>
      </div>

      {eligible.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">No WETH/USDC V3 positions — get one from the Faucet.</p>
      ) : !approvedAll ? (
        <div className="space-y-2">
          <p className="text-sm text-[var(--muted-strong)]">One-time approval to let Koreth custody your V3 NFTs.</p>
          <TxButton
            address={V3_NFT_MANAGER}
            abi={nftManagerAbi}
            functionName="setApprovalForAll"
            args={[deployments.v3Adapter, true]}
            label="Approve V3 positions"
            onConfirmed={() => refetchApproval()}
          />
        </div>
      ) : (
        <div>
          {eligible.map((id) => (
            <div key={id.toString()} className="flex items-center justify-between border-t border-[var(--border)] pt-3 mt-3 first:border-0 first:pt-0 first:mt-0">
              <span className="text-sm">NFT #{id.toString()}</span>
              <TxButton
                address={deployments.positionManager}
                abi={positionManagerAbi}
                functionName="deposit"
                args={[V3_NFT_MANAGER, id, 0n, BigInt(marketId)]}
                label="Deposit"
                onConfirmed={() => {
                  refetchCount();
                  onDone();
                }}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PositionBorrowCard({position, onDone}: {position: SubgraphPosition; onDone: () => void}) {
  const [amount, setAmount] = useState('');
  const id = BigInt(position.id);
  const {symbol, decimals} = position.market;

  const {data: debt, refetch: refetchDebt} = useReadContract({address: deployments.lendingEngine, abi: lendingEngineAbi, functionName: 'getDebt', args: [id]});
  const {data: health, refetch: refetchHealth} = useReadContract({address: deployments.positionManager, abi: positionManagerAbi, functionName: 'getHealthFactor', args: [id]});
  const {data: maxBorrow, refetch: refetchMax} = useReadContract({address: deployments.lendingEngine, abi: lendingEngineAbi, functionName: 'getMaxBorrow', args: [id]});

  const debtBn = (debt as bigint) ?? 0n;
  const available = (maxBorrow as bigint) ?? 0n;
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
