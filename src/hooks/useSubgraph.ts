'use client';

import { useQuery } from '@tanstack/react-query';
import {
  querySubgraph,
  type SubgraphProtocolStats,
  type SubgraphPool,
  type SubgraphCollateralType,
  type SubgraphPosition,
  type SubgraphSupplyPosition,
} from '../lib/subgraph';

/**
 * Every root field below passes `subgraphError: allow`. Without it a subgraph that failed on
 * one handler returns *no* entity fields for any query, so the whole app renders zeros with no
 * explanation; with it, graph-node serves what it indexed before the failure and flags the
 * staleness separately (see useSubgraphHealth).
 */

/**
 * Indexing health, for the stale-data banner. Kept apart from the data hooks so a degraded
 * subgraph is reported once, not per-query.
 */
export function useSubgraphHealth() {
  return useQuery({
    queryKey: ['sg', 'health'],
    queryFn: async () => {
      const data = await querySubgraph<{
        _meta: { hasIndexingErrors: boolean; block: { number: number; timestamp: number } } | null;
      }>(`{ _meta(subgraphError: allow) { hasIndexingErrors block { number timestamp } } }`);
      return data._meta;
    },
    refetchInterval: 30_000,
  });
}

/** Protocol-wide indexed aggregates (TVL, borrowed, position/liquidation counts). */
export function useProtocolStats() {
  return useQuery({
    queryKey: ['sg', 'protocolStats'],
    queryFn: async () => {
      const data = await querySubgraph<{ protocolStats: SubgraphProtocolStats | null }>(
        `{ protocolStats(id: "1", subgraphError: allow) {
            totalTVL globalBorrowsUsd totalPositions totalLiquidations totalFeesCollected
        } }`,
      );
      return data.protocolStats;
    },
    refetchInterval: 15_000,
  });
}

/** Every shared lending pool — one per borrow asset. */
export function useSubgraphPools() {
  return useQuery({
    queryKey: ['sg', 'pools'],
    queryFn: async () => {
      const data = await querySubgraph<{ pools: SubgraphPool[] }>(
        `{ pools(orderBy: symbol, subgraphError: allow) { id address borrowAsset symbol decimals totalSupply } }`,
      );
      return data.pools;
    },
    refetchInterval: 30_000,
  });
}

/** Risk params per collateral type. Disabled types are filtered out — they can't back new debt. */
export function useCollateralTypes() {
  return useQuery({
    queryKey: ['sg', 'collateralTypes'],
    queryFn: async () => {
      const data = await querySubgraph<{ collateralTypes: SubgraphCollateralType[] }>(
        `{ collateralTypes(where: { enabled: true }, orderBy: lpType, subgraphError: allow) {
            id lpType maxLtv liquidationThreshold liquidationBonus borrowCap enabled currentBorrows
        } }`,
      );
      return data.collateralTypes;
    },
    refetchInterval: 30_000,
  });
}

/** A user's lender supply positions across pools. */
export function useSupplyPositions(user?: string) {
  return useQuery({
    queryKey: ['sg', 'supplyPositions', user ?? 'none'],
    queryFn: async () => {
      if (!user) return [] as SubgraphSupplyPosition[];
      const data = await querySubgraph<{ supplyPositions: SubgraphSupplyPosition[] }>(
        `query Supplies($user: Bytes) {
          supplyPositions(where: { user: $user }, subgraphError: allow) {
            id user shares suppliedAmount
            pool { id address symbol decimals borrowAsset }
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

const POSITION_FIELDS = `id owner status lpType depositValue currentDebt pool { id address symbol decimals borrowAsset }`;

/** Indexed positions, optionally filtered to a single owner. */
export function useSubgraphPositions(owner?: string) {
  return useQuery({
    queryKey: ['sg', 'positions', owner ?? 'all'],
    queryFn: async () => {
      // Only declare the $owner variable when we actually filter — graph-node rejects
      // an operation that declares a variable it never uses.
      const query = owner
        ? `query Positions($owner: Bytes) {
            positions(where: { owner: $owner }, orderBy: depositTimestamp, orderDirection: desc, subgraphError: allow) { ${POSITION_FIELDS} }
          }`
        : `{ positions(orderBy: depositTimestamp, orderDirection: desc, subgraphError: allow) { ${POSITION_FIELDS} } }`;
      const data = await querySubgraph<{ positions: SubgraphPosition[] }>(
        query,
        owner ? { owner: owner.toLowerCase() } : undefined,
      );
      return data.positions;
    },
    refetchInterval: 15_000,
  });
}
