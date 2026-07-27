// Minimal GraphQL client for the Koreth subgraph (indexed protocol data).
// Live per-position health/borrow-capacity comes from on-chain reads (PositionViewer);
// this layer serves indexed lists + aggregates.

export const SUBGRAPH_URL =
  process.env.NEXT_PUBLIC_SUBGRAPH_URL ??
  'http://localhost:8000/subgraphs/name/koreth/local';

export async function querySubgraph<T>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(SUBGRAPH_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) {
    throw new Error(`Subgraph HTTP ${res.status}`);
  }
  const json = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (json.errors?.length) {
    throw new Error(json.errors.map((e) => e.message).join('; '));
  }
  if (!json.data) {
    throw new Error('Subgraph returned no data');
  }
  return json.data;
}

// --- Indexed entity shapes (strings, as returned by graph-node) ---

export interface SubgraphProtocolStats {
  totalTVL: string;
  totalBorrowed: string;
  totalPositions: string;
  totalLiquidations: string;
  totalFeesCollected: string;
}

export interface SubgraphMarket {
  id: string;
  address: string;
  lpType: string;
  borrowAsset: string;
  symbol: string;
  decimals: number;
  maxLtv: string;
  totalSupply: string;
}

export interface SubgraphSupplyPosition {
  id: string;
  user: string;
  shares: string;
  suppliedAmount: string;
  market: {id: string; address: string; symbol: string; decimals: number; borrowAsset: string};
}

export interface SubgraphPosition {
  id: string;
  owner: string;
  status: string;
  lpType: string;
  depositValue: string;
  currentDebt: string;
  market: { id: string; lpType: string; borrowAsset: string; symbol: string; decimals: number };
}
