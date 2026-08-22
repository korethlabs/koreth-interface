// Uniswap V3 NonfungiblePositionManager (mainnet) + the minimal ABI the app uses.
export const V3_NFT_MANAGER = '0xC36442b4a4522E871399CD717aBDD847Ab11FE88' as const;
export const V3_FEE = 3000; // 0.3% — matches the whitelisted WETH/USDC pool
// Full range for tickSpacing 60 (0.3% fee).
export const V3_TICK_LOWER = -887220;
export const V3_TICK_UPPER = 887220;

/**
 * Whether a position spans the whole price curve, which is what distinguishes an LP that keeps
 * earning at any price from one that stops when the market leaves its band.
 *
 * The bounds above are the widest ticks that exist at tickSpacing 60, and only the 0.3% tier is
 * accepted as collateral, so comparing against them is exact for every position this app can see.
 */
export function isFullRange(tickLower: number, tickUpper: number): boolean {
  return tickLower <= V3_TICK_LOWER && tickUpper >= V3_TICK_UPPER;
}

export const nftManagerAbi = [
  {
    type: 'function',
    name: 'mint',
    stateMutability: 'payable',
    inputs: [
      {
        name: 'params',
        type: 'tuple',
        components: [
          {name: 'token0', type: 'address'},
          {name: 'token1', type: 'address'},
          {name: 'fee', type: 'uint24'},
          {name: 'tickLower', type: 'int24'},
          {name: 'tickUpper', type: 'int24'},
          {name: 'amount0Desired', type: 'uint256'},
          {name: 'amount1Desired', type: 'uint256'},
          {name: 'amount0Min', type: 'uint256'},
          {name: 'amount1Min', type: 'uint256'},
          {name: 'recipient', type: 'address'},
          {name: 'deadline', type: 'uint256'},
        ],
      },
    ],
    outputs: [
      {name: 'tokenId', type: 'uint256'},
      {name: 'liquidity', type: 'uint128'},
      {name: 'amount0', type: 'uint256'},
      {name: 'amount1', type: 'uint256'},
    ],
  },
  {type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{name: 'owner', type: 'address'}], outputs: [{type: 'uint256'}]},
  {
    type: 'function',
    name: 'tokenOfOwnerByIndex',
    stateMutability: 'view',
    inputs: [{name: 'owner', type: 'address'}, {name: 'index', type: 'uint256'}],
    outputs: [{type: 'uint256'}],
  },
  {
    type: 'function',
    name: 'positions',
    stateMutability: 'view',
    inputs: [{name: 'tokenId', type: 'uint256'}],
    outputs: [
      {name: 'nonce', type: 'uint96'},
      {name: 'operator', type: 'address'},
      {name: 'token0', type: 'address'},
      {name: 'token1', type: 'address'},
      {name: 'fee', type: 'uint24'},
      {name: 'tickLower', type: 'int24'},
      {name: 'tickUpper', type: 'int24'},
      {name: 'liquidity', type: 'uint128'},
      {name: 'feeGrowthInside0LastX128', type: 'uint256'},
      {name: 'feeGrowthInside1LastX128', type: 'uint256'},
      {name: 'tokensOwed0', type: 'uint128'},
      {name: 'tokensOwed1', type: 'uint128'},
    ],
  },
  {
    type: 'function',
    name: 'isApprovedForAll',
    stateMutability: 'view',
    inputs: [{name: 'owner', type: 'address'}, {name: 'operator', type: 'address'}],
    outputs: [{type: 'bool'}],
  },
  {
    type: 'function',
    name: 'setApprovalForAll',
    stateMutability: 'nonpayable',
    inputs: [{name: 'operator', type: 'address'}, {name: 'approved', type: 'bool'}],
    outputs: [],
  },
] as const;
