'use client';

import {useSubgraphHealth} from '@/hooks/useSubgraph';

/**
 * A subgraph that stops indexing keeps answering queries — it just answers with whatever it had
 * when it stopped. Every number in the app then looks live while silently ageing, which is worse
 * than an outright error, so say so explicitly.
 *
 * Renders nothing while the subgraph is healthy. The two unhealthy cases are kept apart because
 * they are not the same situation: a subgraph that reports indexing errors has real data that has
 * stopped moving, while one that cannot be reached at all has told us nothing — claiming it is
 * "behind" would be asserting something we do not know.
 */
export function SubgraphStatusBanner() {
  const {data: meta, isLoading, isError} = useSubgraphHealth();
  if (isLoading) return null;

  const unreachable = isError || !meta;
  if (!unreachable && !meta.hasIndexingErrors) return null;

  return (
    <div
      role="status"
      className="border-b border-[var(--warning)]/30 bg-[var(--warning)]/10 px-6 py-2 text-center text-sm text-[var(--warning)]"
    >
      {unreachable
        ? 'Indexer unreachable — protocol data may be missing or out of date.'
        : `Indexer is behind — protocol data may be incomplete or out of date. Last indexed block ${meta.block.number}.`}{' '}
      On-chain actions are unaffected.
    </div>
  );
}
