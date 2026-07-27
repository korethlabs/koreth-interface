'use client';

import {useMemo, useState} from 'react';
import {useAccount, useReadContract} from 'wagmi';
import {erc20Abi, formatUnits, parseUnits} from 'viem';
import {marketAbi, interestRateModelAbi} from '@/generated/abis';
import {useSubgraphMarkets, useSupplyPositions} from '@/hooks/useSubgraph';
import type {SubgraphMarket, SubgraphSupplyPosition} from '@/lib/subgraph';
import {TxButton} from '@/components/TxButton';
import {ActionButton} from '@/components/ActionButton';
import {TokenChip} from '@/components/TokenChip';

const SECONDS_PER_YEAR = 31_557_600n;

function parseAmount(v: string, decimals: number): bigint {
  try {
    return v ? parseUnits(v, decimals) : 0n;
  } catch {
    return 0n;
  }
}

function fmt(n: number): string {
  return n.toLocaleString('en-US', {maximumFractionDigits: 2});
}

export default function EarnPage() {
  const {address, isConnected} = useAccount();
  const {data: markets} = useSubgraphMarkets();
  const {data: supplies, refetch: refetchSupplies} = useSupplyPositions(address);

  const totalSupplied = useMemo(
    () => (supplies ?? []).reduce((sum, s) => sum + Number(s.suppliedAmount), 0),
    [supplies],
  );

  return (
    <main className="max-w-5xl mx-auto px-6 py-16">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-10">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Earn</h1>
          <p className="mt-2 text-[var(--muted-strong)]">Supply a stablecoin and earn interest from borrowers.</p>
        </div>
        {isConnected && totalSupplied > 0 && (
          <div className="card px-5 py-3 text-right">
            <p className="text-xs text-[var(--muted)]">You&apos;re supplying</p>
            <p className="text-xl font-semibold tabular-nums">${fmt(totalSupplied)}</p>
          </div>
        )}
      </div>

      {!isConnected ? (
        <div className="card p-10 text-center text-[var(--muted)]">Connect your wallet to supply.</div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {(markets ?? []).map((m) => (
            <MarketSupplyCard
              key={m.id}
              market={m}
              owner={address!}
              position={(supplies ?? []).find((s) => s.market.id === m.id)}
              onDone={() => refetchSupplies()}
            />
          ))}
        </div>
      )}
    </main>
  );
}

function MarketSupplyCard({
  market,
  owner,
  position,
  onDone,
}: {
  market: SubgraphMarket;
  owner: `0x${string}`;
  position?: SubgraphSupplyPosition;
  onDone: () => void;
}) {
  const [amount, setAmount] = useState('');
  const asset = market.borrowAsset as `0x${string}`;
  const marketAddr = market.address as `0x${string}`;

  const {data: walletBal, refetch: refetchBal} = useReadContract({address: asset, abi: erc20Abi, functionName: 'balanceOf', args: [owner]});
  const {data: allowance, refetch: refetchAllow} = useReadContract({address: asset, abi: erc20Abi, functionName: 'allowance', args: [owner, marketAddr]});
  const {data: state} = useReadContract({address: marketAddr, abi: marketAbi, functionName: 'getMarketState'});
  const {data: irm} = useReadContract({address: marketAddr, abi: marketAbi, functionName: 'interestRateModel'});
  const {data: reserve} = useReadContract({address: marketAddr, abi: marketAbi, functionName: 'reserveFactorBps'});

  const util = (state as {utilization: bigint} | undefined)?.utilization ?? 0n;
  const irmAddr = irm as `0x${string}` | undefined;
  const {data: supplyRatePerSec} = useReadContract({
    address: irmAddr,
    abi: interestRateModelAbi,
    functionName: 'getSupplyRate',
    args: [util, (reserve as bigint) ?? 0n],
    query: {enabled: !!irmAddr && state !== undefined && reserve !== undefined},
  });
  const apr =
    supplyRatePerSec === undefined
      ? '—'
      : `${(Number(formatUnits((supplyRatePerSec as bigint) * SECONDS_PER_YEAR, 18)) * 100).toFixed(2)}%`;

  const parsed = parseAmount(amount, market.decimals);
  const balance = (walletBal as bigint) ?? 0n;
  const valid = parsed > 0n && parsed <= balance;
  const shares = position ? BigInt(position.shares) : 0n;

  return (
    <div className="card card-hover p-5 space-y-5">
      {/* Header: token chip + APR */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <TokenChip label={market.symbol} />
          <div>
            <p className="font-semibold leading-tight">{market.symbol}</p>
            <p className="text-xs text-[var(--muted)]">{market.lpType} · market #{market.id}</p>
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
          <p className="tabular-nums">{fmt(Number(market.totalSupply))}</p>
        </div>
        <div>
          <p className="text-[var(--muted)] text-xs">Your supply</p>
          <p className="tabular-nums">{position ? fmt(Number(position.suppliedAmount)) : '0'}</p>
        </div>
      </div>

      {/* Action */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between text-xs text-[var(--muted)]">
          <span>Wallet</span>
          <button onClick={() => setAmount(formatUnits(balance, market.decimals))} className="hover:text-[var(--foreground)]">
            {fmt(Number(formatUnits(balance, market.decimals)))} {market.symbol} · Max
          </button>
        </div>
        <div className="flex gap-2">
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.0"
            inputMode="decimal"
            className="input flex-1 p-2.5"
          />
          <ActionButton
            approve={{token: asset, spender: marketAddr, amount: parsed, allowance: (allowance as bigint) ?? 0n}}
            address={marketAddr}
            abi={marketAbi}
            functionName="supply"
            args={[parsed]}
            label="Supply"
            disabled={!valid}
            onConfirmed={() => {
              setAmount('');
              refetchBal();
              refetchAllow();
              onDone();
            }}
          />
        </div>
        {shares > 0n && (
          <TxButton
            address={marketAddr}
            abi={marketAbi}
            functionName="withdraw"
            args={[shares]}
            label="Withdraw all"
            onConfirmed={() => {
              refetchBal();
              onDone();
            }}
          />
        )}
      </div>
    </div>
  );
}
