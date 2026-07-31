'use client';

import {useSubgraphHealth} from '@/hooks/useSubgraph';

/**
 * A subgraph that stops indexing keeps answering queries — it just answers with whatever it had
 * when it stopped. Every number in the app then looks live while silently ageing, which is worse
 * than an outright error, so say so explicitly.
 *
 * Renders nothing while the subgraph is healthy. `_meta` itself being null means the query API
 * could not report at all, which is also worth flagging.
 */
export function SubgraphStatusBanner() {
  const {data: meta, isLoading} = useSubgraphHealth();
  if (isLoading || (meta && !meta.hasIndexingErrors)) return null;

  return (
    <div
      role="status"
      className="border-b border-[var(--warning)]/30 bg-[var(--warning)]/10 px-6 py-2 text-center text-sm text-[var(--warning)]"
    >
      Indexer is behind — protocol data may be incomplete or out of date.
      {meta && ` Last indexed block ${meta.block.number}.`} On-chain actions are unaffected.
    </div>
  );
}
