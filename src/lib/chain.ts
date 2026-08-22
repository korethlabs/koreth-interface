import {defineChain} from 'viem';
import {deployments} from '@/generated/deployments';

/**
 * How often reads that are shown as live are re-run.
 *
 * wagmi's useReadContract is query-backed and settles after its first fetch, so a collateral value,
 * a health factor or a position's status would otherwise be pinned to the moment the page mounted
 * — the same staleness this app moved off the subgraph to escape, just with a shorter fuse. Set to
 * one mainnet block: the figures are re-derived on-chain per block, and anything shorter only costs
 * RPC calls to return the same answer.
 */
export const LIVE_REFETCH_MS = 12_000;

// Local anvil mainnet-fork. chainId 1337 (not 1) so MetaMask can add it as a custom network.
export const korethLocal = defineChain({
  id: deployments.chainId,
  name: 'Koreth Local',
  nativeCurrency: {name: 'Ether', symbol: 'ETH', decimals: 18},
  rpcUrls: {
    default: {http: [process.env.NEXT_PUBLIC_RPC_URL ?? 'http://localhost:8547']},
  },
});
