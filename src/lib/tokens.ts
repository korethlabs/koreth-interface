import {deployments} from '@/generated/deployments';

export interface TokenInfo {
  symbol: string;
  decimals: number;
}

const BY_ADDRESS: Record<string, TokenInfo> = {
  [deployments.usdc.toLowerCase()]: {symbol: 'USDC', decimals: 6},
  [deployments.usdt.toLowerCase()]: {symbol: 'USDT', decimals: 6},
  [deployments.dai.toLowerCase()]: {symbol: 'DAI', decimals: 18},
  [deployments.weth.toLowerCase()]: {symbol: 'WETH', decimals: 18},
};

/** Metadata for a known token; falls back to a shortened address / 18 decimals. */
export function tokenInfo(address: string): TokenInfo {
  return BY_ADDRESS[address.toLowerCase()] ?? {symbol: `${address.slice(0, 6)}…`, decimals: 18};
}
