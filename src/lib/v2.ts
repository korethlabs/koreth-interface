// Uniswap V2 pair — the minimal ABI the app reads beyond ERC-20. balanceOf/totalSupply/allowance
// come from viem's erc20Abi, since a pair is an ERC-20 in its own right.
export const v2PairAbi = [
  {
    type: 'function',
    name: 'getReserves',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      {name: 'reserve0', type: 'uint112'},
      {name: 'reserve1', type: 'uint112'},
      {name: 'blockTimestampLast', type: 'uint32'},
    ],
  },
  {type: 'function', name: 'token0', stateMutability: 'view', inputs: [], outputs: [{type: 'address'}]},
  {type: 'function', name: 'token1', stateMutability: 'view', inputs: [], outputs: [{type: 'address'}]},
] as const;
