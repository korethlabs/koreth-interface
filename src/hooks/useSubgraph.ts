'use client';

import { useQuery } from '@tanstack/react-query';
import {
  querySubgraph,
  type SubgraphProtocolStats,
  type SubgraphMarket,
  type SubgraphPosition,
  type SubgraphSupplyPosition,
} from '../lib/subgraph';

/** Protocol-wide indexed aggregates (TVL, borrowed, position/liquidation counts). */
export function useProtocolStats() {
  return useQuery({
    queryKey: ['sg', 'protocolStats'],
    queryFn: async () => {
      const data = await querySubgraph<{ protocolStats: SubgraphProtocolStats | null }>(
        `{ protocolStats(id: "1") {
            totalTVL totalBorrowed totalPositions totalLiquidations totalFeesCollected
        } }`,
      );
      return data.protocolStats;
    },
    refetchInterval: 15_000,
  });
}

/** All markets with their config (lpType, borrow asset, symbol, decimals, max LTV, supply). */
export function useSubgraphMarkets() {
  return useQuery({
    queryKey: ['sg', 'markets'],
    queryFn: async () => {
      const data = await querySubgraph<{ markets: SubgraphMarket[] }>(
        `{ markets(orderBy: id) { id address lpType borrowAsset symbol decimals maxLtv totalSupply } }`,
      );
      return data.markets;
    },
    refetchInterval: 30_000,
  });
}

/** A user's lender supply positions across markets. */
export function useSupplyPositions(user?: string) {
  return useQuery({
    queryKey: ['sg', 'supplyPositions', user ?? 'none'],
    queryFn: async () => {
      if (!user) return [] as SubgraphSupplyPosition[];
      const data = await querySubgraph<{ supplyPositions: SubgraphSupplyPosition[] }>(
        `query Supplies($user: Bytes) {
          supplyPositions(where: { user: $user }) {
            id user shares suppliedAmount
            market { id address symbol decimals borrowAsset }
          }
        }`,
        { user: user.toLowerCase() },
      );
      return data.supplyPositions;
    },
    enabled: !!user,
    refetchInterval: 15_000,
  });
}

const POSITION_FIELDS = `id owner status lpType depositValue currentDebt market { id address lpType borrowAsset symbol decimals }`;

/** Indexed positions, optionally filtered to a single owner. */
export function useSubgraphPositions(owner?: string) {
  return useQuery({
    queryKey: ['sg', 'positions', owner ?? 'all'],
    queryFn: async () => {
      // Only declare the $owner variable when we actually filter — graph-node rejects
      // an operation that declares a variable it never uses.
      const query = owner
        ? `query Positions($owner: Bytes) {
            positions(where: { owner: $owner }, orderBy: depositTimestamp, orderDirection: desc) { ${POSITION_FIELDS} }
          }`
        : `{ positions(orderBy: depositTimestamp, orderDirection: desc) { ${POSITION_FIELDS} } }`;
      const data = await querySubgraph<{ positions: SubgraphPosition[] }>(
        query,
        owner ? { owner: owner.toLowerCase() } : undefined,
      );
      return data.positions;
    },
    refetchInterval: 15_000,
  });
}
