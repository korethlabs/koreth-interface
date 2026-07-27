'use client';

import {WagmiProvider, createConfig, http} from 'wagmi';
import {injected} from 'wagmi/connectors';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {ConnectKitProvider} from 'connectkit';
import {korethLocal} from '@/lib/chain';

const config = createConfig({
  chains: [korethLocal],
  connectors: [injected()], // MetaMask / any injected wallet
  transports: {[korethLocal.id]: http()}, // uses the chain's default RPC (NEXT_PUBLIC_RPC_URL)
  ssr: true,
});

const queryClient = new QueryClient();

export function Web3Provider({children}: {children: React.ReactNode}) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <ConnectKitProvider>{children}</ConnectKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
