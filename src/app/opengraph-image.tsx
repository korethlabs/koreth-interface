import { ImageResponse } from 'next/og';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const alt = 'Koreth — Borrow against your LP';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// Branded social-share card (used for OpenGraph and Twitter fallback).
export default function OgImage() {
  const logo = readFileSync(join(process.cwd(), 'public', 'koreth-logo.svg'));
  const logoSrc = `data:image/svg+xml;base64,${logo.toString('base64')}`;

  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '80px',
          background: 'radial-gradient(1200px 600px at 80% -10%, #0c1a2e 0%, #05070d 55%)',
          color: '#e8eef8',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoSrc} width={84} height={82} alt="" />
          <div style={{ fontSize: '34px', color: '#ffffff', letterSpacing: '0.08em', fontWeight: 600 }}>
            KORETH
          </div>
        </div>
        <div
          style={{
            marginTop: '36px',
            fontSize: '84px',
            fontWeight: 700,
            lineHeight: 1.05,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <span>Borrow against your LP.</span>
          <span style={{ color: '#5eead4' }}>Keep earning.</span>
        </div>
        <div style={{ marginTop: '32px', fontSize: '32px', color: '#a8b4c8', maxWidth: '900px' }}>
          Unlock liquidity from your LP positions without withdrawing.
        </div>
      </div>
    ),
    { ...size }
  );
}
