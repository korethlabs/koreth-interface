import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Web3Provider } from '@/providers/Web3Provider';
import { Header } from '@/components/Header';
import { SubgraphStatusBanner } from '@/components/SubgraphStatusBanner';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' });

const title = 'Koreth — Borrow against your LP';
const description =
  'Unlock liquidity from your LP positions without withdrawing. Lend and borrow on Koreth.';

export const metadata: Metadata = {
  metadataBase: new URL('https://app.koreth.finance'),
  title: { default: title, template: '%s · Koreth' },
  description,
  applicationName: 'Koreth',
  openGraph: {
    title,
    description,
    url: '/',
    siteName: 'Koreth',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
  },
};

export const viewport: Viewport = {
  themeColor: '#05070d',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      {/* suppressHydrationWarning: browser extensions inject attrs (e.g. data-gptw) onto
          <body> before hydration, which is harmless but trips React's mismatch check. */}
      <body suppressHydrationWarning>
        <Web3Provider>
          <Header />
          <SubgraphStatusBanner />
          {children}
        </Web3Provider>
      </body>
    </html>
  );
}
