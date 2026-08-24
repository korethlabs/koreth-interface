import {deployments} from '@/generated/deployments';

export interface TokenInfo {
  symbol: string;
  /**
   * Absent for a token this table does not know. Optional rather than defaulted, so that a caller
   * scaling an amount by it has to decide what to do without one instead of being handed a guess.
   */
  decimals?: number;
}

const BY_ADDRESS: Record<string, TokenInfo> = {
  [deployments.usdc.toLowerCase()]: {symbol: 'USDC', decimals: 6},
  [deployments.usdt.toLowerCase()]: {symbol: 'USDT', decimals: 6},
  [deployments.dai.toLowerCase()]: {symbol: 'DAI', decimals: 18},
  [deployments.weth.toLowerCase()]: {symbol: 'WETH', decimals: 18},
};

/**
 * Metadata for a token, by address.
 *
 * An unknown token gets a shortened address for a symbol — visibly not a ticker, which is the point:
 * it tells the reader the app does not recognise this token rather than pretending to. It gets no
 * decimals at all. There is no safe default: assuming 18 renders a 6-decimal balance a million times
 * too small, and unlike the symbol, a wrong number carries no cue that it is wrong.
 *
 * Which tokens appear here is no longer bounded by the four the protocol launched with — the
 * accepted pools are enumerated from the chain — so an address landing outside this table is a
 * reachable state rather than a theoretical one.
 */
export function tokenInfo(address: string): TokenInfo {
  return BY_ADDRESS[address.toLowerCase()] ?? {symbol: `${address.slice(0, 6)}…`};
}
