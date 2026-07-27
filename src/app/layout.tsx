import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Web3Provider } from '@/providers/Web3Provider';
import { Header } from '@/components/Header';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' });

export const metadata: Metadata = {
  title: 'Koreth — Borrow against your LP',
  description: 'Unlock liquidity from your LP positions without withdrawing. Lend and borrow on Koreth.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      {/* suppressHydrationWarning: browser extensions inject attrs (e.g. data-gptw) onto
          <body> before hydration, which is harmless but trips React's mismatch check. */}
      <body suppressHydrationWarning>
        <Web3Provider>
          <Header />
          {children}
        </Web3Provider>
      </body>
    </html>
  );
}
