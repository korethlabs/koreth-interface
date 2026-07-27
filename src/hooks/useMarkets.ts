'use client';

import { useQuery } from '@tanstack/react-query';
import type { MarketView } from '@koreth/sdk';

export function useMarkets() {
  return useQuery({
    queryKey: ['markets'],
    queryFn: async (): Promise<MarketView[]> => {
      // TODO: Fetch from backend API or directly from contracts
      return [];
    },
    refetchInterval: 30_000,
  });
}
