import {
  encodeAbiParameters,
  encodeFunctionData,
  erc20Abi,
  keccak256,
  pad,
  parseEther,
  parseUnits,
  toHex,
  type Address,
} from 'viem';
import {deployments} from '@/generated/deployments';
import {rpc} from './rpc';
import {V3_NFT_MANAGER, V3_FEE, V3_TICK_LOWER, V3_TICK_UPPER, nftManagerAbi} from './v3';

const V2_ROUTER = '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D' as const;

// ERC20 balanceOf mapping storage slots (verified on the fork).
const SLOT = {usdc: 9, usdt: 2, dai: 2, weth: 3} as const;

const routerAbi = [
  {
    type: 'function',
    name: 'addLiquidity',
    stateMutability: 'nonpayable',
    inputs: [
      {name: 'tokenA', type: 'address'},
      {name: 'tokenB', type: 'address'},
      {name: 'amountADesired', type: 'uint256'},
      {name: 'amountBDesired', type: 'uint256'},
      {name: 'amountAMin', type: 'uint256'},
      {name: 'amountBMin', type: 'uint256'},
      {name: 'to', type: 'address'},
      {name: 'deadline', type: 'uint256'},
    ],
    outputs: [
      {name: 'amountA', type: 'uint256'},
      {name: 'amountB', type: 'uint256'},
      {name: 'liquidity', type: 'uint256'},
    ],
  },
] as const;

// Storage key of balanceOf[user] = keccak256(abi.encode(user, slot)).
function balanceSlotKey(user: Address, slot: number): `0x${string}` {
  return keccak256(encodeAbiParameters([{type: 'address'}, {type: 'uint256'}], [user, BigInt(slot)]));
}

async function deal(token: Address, user: Address, amount: bigint, slot: number): Promise<void> {
  await rpc('anvil_setStorageAt', [token, balanceSlotKey(user, slot), pad(toHex(amount), {size: 32})]);
}

function send(from: Address, to: Address, data: `0x${string}`): Promise<unknown> {
  return rpc('eth_sendTransaction', [{from, to, data}]);
}

/**
 * Fund a wallet on the anvil fork: gas + stablecoins + WETH (via storage writes / "deal"), then
 * mint fresh Uniswap V2 LP by impersonating the user and adding WETH/USDC liquidity.
 */
export async function fundWallet(user: Address): Promise<void> {
  await rpc('anvil_setBalance', [user, toHex(parseEther('100'))]);
  await deal(deployments.usdc, user, parseUnits('100000', 6), SLOT.usdc);
  await deal(deployments.usdt, user, parseUnits('30000', 6), SLOT.usdt);
  await deal(deployments.dai, user, parseUnits('30000', 18), SLOT.dai);
  await deal(deployments.weth, user, parseEther('20'), SLOT.weth);

  const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
  await rpc('anvil_impersonateAccount', [user]);

  // V2 LP: approve + addLiquidity(WETH/USDC)
  await send(user, deployments.weth, encodeFunctionData({abi: erc20Abi, functionName: 'approve', args: [V2_ROUTER, parseEther('5')]}));
  await send(user, deployments.usdc, encodeFunctionData({abi: erc20Abi, functionName: 'approve', args: [V2_ROUTER, parseUnits('30000', 6)]}));
  await send(
    user,
    V2_ROUTER,
    encodeFunctionData({
      abi: routerAbi,
      functionName: 'addLiquidity',
      args: [deployments.weth, deployments.usdc, parseEther('5'), parseUnits('30000', 6), 0n, 0n, user, deadline],
    }),
  );

  // V3 LP: approve NFT manager + mint a full-range WETH/USDC 0.3% position (token0=USDC < token1=WETH)
  await send(user, deployments.weth, encodeFunctionData({abi: erc20Abi, functionName: 'approve', args: [V3_NFT_MANAGER, parseEther('8')]}));
  await send(user, deployments.usdc, encodeFunctionData({abi: erc20Abi, functionName: 'approve', args: [V3_NFT_MANAGER, parseUnits('40000', 6)]}));
  await send(
    user,
    V3_NFT_MANAGER,
    encodeFunctionData({
      abi: nftManagerAbi,
      functionName: 'mint',
      args: [
        {
          token0: deployments.usdc,
          token1: deployments.weth,
          fee: V3_FEE,
          tickLower: V3_TICK_LOWER,
          tickUpper: V3_TICK_UPPER,
          amount0Desired: parseUnits('20000', 6),
          amount1Desired: parseEther('8'),
          amount0Min: 0n,
          amount1Min: 0n,
          recipient: user,
          deadline,
        },
      ],
    }),
  );

  await rpc('anvil_stopImpersonatingAccount', [user]);
}
