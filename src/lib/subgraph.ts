// Minimal GraphQL client for the Koreth subgraph (indexed protocol data).
// Live per-position health/borrow-capacity comes from on-chain reads (PositionViewer);
// this layer serves indexed lists + aggregates.

export const SUBGRAPH_URL =
  process.env.NEXT_PUBLIC_SUBGRAPH_URL ??
  'http://localhost:8000/subgraphs/name/koreth/local';

/**
 * graph-node's marker for "this subgraph hit an indexing error", reported as a GraphQL error
 * rather than as a transport failure.
 */
const INDEXING_ERROR = 'indexing_error';

/**
 * A single failing handler makes graph-node flag the *whole* subgraph, so every query — even
 * ones touching entities the broken handler never writes — comes back carrying an
 * `indexing_error`. Rejecting on it blanked the entire app over data that was merely stale, and
 * without saying why. Root fields therefore ask for `subgraphError: allow`, which returns the
 * data indexed up to the failure alongside the marker, and this only rejects when the data is
 * genuinely absent or the error is a real one (bad query, unknown field, HTTP failure).
 *
 * Staleness is not swallowed: useSubgraphHealth() surfaces it as a banner.
 */
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
  const errors = json.errors ?? [];
  const fatal = errors.filter((e) => e.message !== INDEXING_ERROR);
  if (fatal.length) {
    throw new Error(fatal.map((e) => e.message).join('; '));
  }
  if (!json.data) {
    // An indexing_error with no data means the query did not opt in via `subgraphError: allow`,
    // and graph-node omitted the entity fields. Nothing usable came back either way.
    throw new Error(
      errors.length ? errors.map((e) => e.message).join('; ') : 'Subgraph returned no data',
    );
  }
  return json.data;
}

// --- Indexed entity shapes (strings, as returned by graph-node) ---

export interface SubgraphProtocolStats {
  totalTVL: string;
  /**
   * Protocol-wide borrows in USD, as tracked by RiskManager. This replaces the old
   * `totalBorrowed`, which summed each pool's borrows in its own units and so added USDC to
   * WETH once more than one pool existed.
   */
  globalBorrowsUsd: string;
  totalPositions: string;
  totalLiquidations: string;
  totalFeesCollected: string;
}

/** A shared lending pool — one per borrow asset, open to every collateral type. */
export interface SubgraphPool {
  id: string;
  address: string;
  borrowAsset: string;
  symbol: string;
  decimals: number;
  totalSupply: string;
}

/**
 * Risk parameters for one LP type. These are set once in RiskManager and apply across every
 * pool, so they are keyed by collateral type rather than by market.
 */
export interface SubgraphCollateralType {
  id: string;
  lpType: number;
  maxLtv: string;
  liquidationThreshold: string;
  liquidationBonus: string;
  borrowCap: string;
  enabled: boolean;
  currentBorrows: string;
}

export type SubgraphPoolRef = {id: string; address: string; symbol: string; decimals: number; borrowAsset: string};

export interface SubgraphSupplyPosition {
  id: string;
  user: string;
  shares: string;
  suppliedAmount: string;
  pool: SubgraphPoolRef;
}

export interface SubgraphPosition {
  id: string;
  owner: string;
  status: string;
  lpType: string;
  depositValue: string;
  currentDebt: string;
  pool: SubgraphPoolRef;
}
