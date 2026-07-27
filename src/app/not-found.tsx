import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="max-w-7xl mx-auto px-6 py-32 text-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/koreth-logo.svg" alt="Koreth" className="h-16 w-auto mx-auto opacity-90" />
      <h1 className="mt-8 text-4xl font-semibold tracking-tight">Page not found</h1>
      <p className="mt-3 text-[var(--muted-strong)]">
        The page you&rsquo;re looking for doesn&rsquo;t exist or has moved.
      </p>
      <Link href="/" className="btn-primary inline-block mt-8 px-5 py-2.5 text-sm">
        Back to dashboard
      </Link>
    </main>
  );
}
