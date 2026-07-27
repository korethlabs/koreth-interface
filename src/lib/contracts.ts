// Contract addresses and ABI imports
// TODO: Import from @koreth/sdk after deployment

export const CONTRACTS = {
  1: {
    // Ethereum
    positionManager: '0x' as const,
    lendingEngine: '0x' as const,
    liquidationEngine: '0x' as const,
    router: '0x' as const,
    positionViewer: '0x' as const,
  },
  8453: {
    // Base
    positionManager: '0x' as const,
    lendingEngine: '0x' as const,
    liquidationEngine: '0x' as const,
    router: '0x' as const,
    positionViewer: '0x' as const,
  },
} as const;
