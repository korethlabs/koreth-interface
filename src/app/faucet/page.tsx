'use client';

import {useState} from 'react';
import {useAccount} from 'wagmi';
import {useQueryClient} from '@tanstack/react-query';
import {fundWallet} from '@/lib/faucet';

type Status = 'idle' | 'funding' | 'done' | 'error';

export default function FaucetPage() {
  const {address, isConnected} = useAccount();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState('');

  async function fund() {
    if (!address) return;
    setStatus('funding');
    setError('');
    try {
      await fundWallet(address);
      // Faucet mutated chain state outside wagmi — refetch all reads (balances, positions, …).
      await queryClient.invalidateQueries();
      setStatus('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus('error');
    }
  }

  return (
    <main className="max-w-2xl mx-auto px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Faucet</h1>
      <p className="mt-2 text-[var(--muted-strong)]">
        Fund your connected wallet on the fork — gas, stablecoins, and Uniswap LP to test the app.
      </p>

      <div className="card p-6 mt-8 space-y-5">
        <ul className="text-sm text-[var(--muted-strong)] space-y-1.5">
          <li>· 100 ETH (gas)</li>
          <li>· 100,000 each of USDC, USDT and DAI, plus WETH</li>
          <li>
            · A <strong>V2 LP</strong> balance and a full-range <strong>V3 position (NFT)</strong>{' '}
            for WETH/USDC, WETH/USDT and WETH/DAI — six holdings, all usable as collateral
          </li>
        </ul>

        {!isConnected ? (
          <p className="text-[var(--muted)]">Connect your wallet to receive test funds.</p>
        ) : (
          <button onClick={fund} disabled={status === 'funding'} className="btn-primary px-5 py-2.5 text-sm">
            {status === 'funding' ? 'Funding…' : 'Fund my wallet'}
          </button>
        )}

        {status === 'done' && (
          <p className="text-[var(--success)] text-sm">
            Done. Balances updated — if a transaction later fails with a nonce error, reset the account in
            MetaMask (Settings → Advanced → Clear activity tab data).
          </p>
        )}
        {status === 'error' && <p className="text-[var(--danger)] text-sm break-words">{error}</p>}
      </div>

      <p className="mt-4 text-xs text-[var(--muted)]">
        Dev-only: uses anvil methods (setBalance / account impersonation) that work solely on the local fork.
      </p>
    </main>
  );
}
