import type { ReactNode } from 'react';

// Shared shell for the legal / info pages (Terms, Privacy, FAQ).
export function LegalPage({
  title,
  updated,
  draft = true,
  children,
}: {
  title: string;
  updated?: string;
  draft?: boolean;
  children: ReactNode;
}) {
  return (
    <main className="max-w-3xl mx-auto px-6 py-16">
      {draft && (
        <span className="badge text-[var(--accent-2)] border-[var(--accent-2)]/30">
          Draft — pending legal review
        </span>
      )}
      <h1 className="mt-5 text-4xl font-semibold tracking-tight">{title}</h1>
      {updated && <p className="mt-2 text-sm text-[var(--muted)]">Last updated {updated}</p>}
      <div
        className="mt-8 space-y-4 text-[var(--muted-strong)] leading-relaxed
          [&_h2]:text-[var(--foreground)] [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:mt-10 [&_h2]:mb-1
          [&_h3]:text-[var(--foreground)] [&_h3]:font-medium [&_h3]:mt-6 [&_h3]:mb-1
          [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:space-y-1
          [&_a]:text-[var(--accent)] [&_a]:underline"
      >
        {children}
      </div>
    </main>
  );
}
