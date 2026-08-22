'use client';

import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {ConnectKitButton} from 'connectkit';

const NAV = [
  {href: '/', label: 'Dashboard'},
  {href: '/markets', label: 'Markets'},
  {href: '/earn', label: 'Earn'},
  {href: '/borrow', label: 'Borrow'},
  {href: '/portfolio', label: 'Portfolio'},
  {href: '/faucet', label: 'Faucet'},
];

export function Header() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 border-b border-[var(--border)] bg-[var(--background)]/70 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto flex items-center justify-between px-6 h-16">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/koreth-logo.svg" alt="Koreth" className="h-9 w-auto opacity-95" />
            <span className="text-lg font-semibold tracking-tight">Koreth</span>
          </Link>
          <nav className="hidden md:flex items-center gap-6 text-sm">
            {NAV.map((n) => {
              const active = n.href === '/' ? pathname === '/' : pathname.startsWith(n.href);
              return (
                <Link key={n.href} href={n.href} className="nav-link font-medium" data-active={active}>
                  {n.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <ConnectKitButton />
        </div>
      </div>
    </header>
  );
}
