import {defineChain} from 'viem';
import {deployments} from '@/generated/deployments';

// Local anvil mainnet-fork. chainId 1337 (not 1) so MetaMask can add it as a custom network.
export const korethLocal = defineChain({
  id: deployments.chainId,
  name: 'Koreth Local',
  nativeCurrency: {name: 'Ether', symbol: 'ETH', decimals: 18},
  rpcUrls: {
    default: {http: [process.env.NEXT_PUBLIC_RPC_URL ?? 'http://localhost:8547']},
  },
});
