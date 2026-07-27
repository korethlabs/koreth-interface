const TOKEN_COLOR: Record<string, string> = {
  USDC: '#2775CA',
  USDT: '#26A17B',
  DAI: '#F5AC37',
};

export function tokenColor(symbol: string): string {
  return TOKEN_COLOR[symbol] ?? '#5eead4';
}

/** A small brand-colored chip showing a token symbol (or any short label). */
export function TokenChip({label, color, size = 44}: {label: string; color?: string; size?: number}) {
  return (
    <div
      style={{background: color ?? tokenColor(label), width: size, height: size}}
      className="rounded-xl flex items-center justify-center text-[11px] font-bold text-white shadow-inner shrink-0"
    >
      {label}
    </div>
  );
}
