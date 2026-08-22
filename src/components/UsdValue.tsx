import {formatUnits} from 'viem';

/** LPOracleHub prices in USD with 18 decimals, regardless of the collateral's own decimals. */
export const USD_DECIMALS = 18;

export function formatUsd(v: bigint, maximumFractionDigits = 2): string {
  return Number(formatUnits(v, USD_DECIMALS)).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits,
  });
}

/**
 * Renders an oracle-sourced USD figure, including the two cases where there isn't one.
 *
 * The oracle reverts instead of returning a stale figure when a Chainlink feed is down, so a
 * failed read is rendered as unavailable. Substituting a fallback — spot reserves, or zero —
 * would state a collateral value the protocol would refuse to credit.
 */
export function UsdValue({
  value,
  isError,
  approx = true,
  maximumFractionDigits,
  className = '',
}: {
  value: bigint | undefined;
  isError: boolean;
  approx?: boolean;
  maximumFractionDigits?: number;
  className?: string;
}) {
  if (isError) return <span className={`text-[var(--muted)] ${className}`}>price unavailable</span>;
  if (value === undefined) return <span className={`text-[var(--muted)] ${className}`}>—</span>;
  return (
    <span className={className}>
      {approx ? '≈ ' : ''}
      {formatUsd(value, maximumFractionDigits)}
    </span>
  );
}
