'use client';

import {useState} from 'react';
import {auroraLocal} from '@/lib/chain';

// Minimal injected-provider shape (MetaMask).
interface Eip1193 {
  request(args: {method: string; params?: unknown[]}): Promise<unknown>;
}
function injected(): Eip1193 | undefined {
  return (globalThis as unknown as {ethereum?: Eip1193}).ethereum;
}

/** One-click "Add Koreth Local to MetaMask" — adds the chain and switches to it. */
export function AddNetworkButton({className = ''}: {className?: string}) {
  const [busy, setBusy] = useState(false);

  async function add() {
    const eth = injected();
    if (!eth) {
      window.open('https://metamask.io/download/', '_blank');
      return;
    }
    setBusy(true);
    try {
      // wallet_addEthereumChain adds the network if missing and prompts a switch to it.
      await eth.request({
        method: 'wallet_addEthereumChain',
        params: [
          {
            chainId: `0x${auroraLocal.id.toString(16)}`,
            chainName: auroraLocal.name,
            nativeCurrency: auroraLocal.nativeCurrency,
            rpcUrls: auroraLocal.rpcUrls.default.http,
          },
        ],
      });
    } catch {
      // user rejected or already added — nothing to do
    } finally {
      setBusy(false);
    }
  }

  return (
    <button onClick={add} disabled={busy} className={`btn-ghost px-3 py-1.5 text-sm ${className}`}>
      {busy ? 'Check MetaMask…' : 'Add network'}
    </button>
  );
}
