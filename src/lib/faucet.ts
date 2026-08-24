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
 * Set an allowance, clearing it first.
 *
 * USDT rejects a non-zero approval on top of a non-zero allowance, and `addLiquidity` returns the
 * unused part of what it was allowed — so the second run of this faucet would revert on a residue
 * left by the first. Done for every token rather than for USDT alone: the extra call is free on a
 * fork, and a rule applied to one token is a rule that gets forgotten when a fourth is added.
 */
async function approve(user: Address, token: Address, spender: Address, amount: bigint): Promise<void> {
  await send(user, token, encodeFunctionData({abi: erc20Abi, functionName: 'approve', args: [spender, 0n]}));
  await send(user, token, encodeFunctionData({abi: erc20Abi, functionName: 'approve', args: [spender, amount]}));
}

/** Uniswap orders a pool's tokens by address, and the mint arguments have to follow. */
function sortPair(a: Address, amountA: bigint, b: Address, amountB: bigint) {
  return a.toLowerCase() < b.toLowerCase()
    ? {token0: a, amount0: amountA, token1: b, amount1: amountB}
    : {token0: b, amount0: amountB, token1: a, amount1: amountA};
}

/**
 * The quote tokens WETH is paired against, matching the pools the protocol whitelists. A holding in
 * every one of them is the point: with only WETH/USDC funded, the pair switcher on /borrow has
 * nothing to switch to and the empty-tab case is the only one anyone ever sees.
 */
const QUOTES = [
  {token: deployments.usdc, decimals: 6, slot: SLOT.usdc},
  {token: deployments.usdt, decimals: 6, slot: SLOT.usdt},
  {token: deployments.dai, decimals: 18, slot: SLOT.dai},
] as const;

const V2_WETH = parseEther('5');
const V3_WETH = parseEther('8');
const V2_QUOTE = 30_000;
const V3_QUOTE = 20_000;

/**
 * Fund a wallet on the anvil fork: gas + stablecoins + WETH (via storage writes / "deal"), then
 * mint a Uniswap V2 LP balance and a full-range V3 position for each accepted pair by impersonating
 * the user.
 *
 * The dealt amounts cover what the six mints consume with room over, so the wallet is left holding
 * loose tokens too — the balances are a set rather than an add, so nothing accumulates across runs.
 */
export async function fundWallet(user: Address): Promise<void> {
  await rpc('anvil_setBalance', [user, toHex(parseEther('100'))]);
  await deal(deployments.weth, user, parseEther('60'), SLOT.weth);
  for (const {token, decimals, slot} of QUOTES) {
    await deal(token, user, parseUnits('100000', decimals), slot);
  }

  const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
  await rpc('anvil_impersonateAccount', [user]);

  // Impersonation is released even if a mint reverts. Left on, the node keeps accepting unsigned
  // transactions from this address, so a later failure in the app would be indistinguishable from
  // one the user authorised — and the faucet is the one place that turns it on.
  try {
    await mintLpHoldings(user, deadline);
  } finally {
    await rpc('anvil_stopImpersonatingAccount', [user]);
  }
}

/** The six mints, run while `user` is impersonated. */
async function mintLpHoldings(user: Address, deadline: bigint): Promise<void> {
  for (const {token, decimals} of QUOTES) {
    // V2 LP: approve + addLiquidity. The router takes whichever leg binds at the pool's current
    // ratio and returns the rest, so the amounts are ceilings rather than the deposit itself.
    const v2Quote = parseUnits(String(V2_QUOTE), decimals);
    await approve(user, deployments.weth, V2_ROUTER, V2_WETH);
    await approve(user, token, V2_ROUTER, v2Quote);
    await send(
      user,
      V2_ROUTER,
      encodeFunctionData({
        abi: routerAbi,
        functionName: 'addLiquidity',
        args: [deployments.weth, token, V2_WETH, v2Quote, 0n, 0n, user, deadline],
      }),
    );

    // V3 LP: approve the NFT manager + mint a full-range position at the whitelisted fee tier.
    const v3Quote = parseUnits(String(V3_QUOTE), decimals);
    await approve(user, deployments.weth, V3_NFT_MANAGER, V3_WETH);
    await approve(user, token, V3_NFT_MANAGER, v3Quote);
    const {token0, amount0, token1, amount1} = sortPair(deployments.weth, V3_WETH, token, v3Quote);
    await send(
      user,
      V3_NFT_MANAGER,
      encodeFunctionData({
        abi: nftManagerAbi,
        functionName: 'mint',
        args: [
          {
            token0,
            token1,
            fee: V3_FEE,
            tickLower: V3_TICK_LOWER,
            tickUpper: V3_TICK_UPPER,
            amount0Desired: amount0,
            amount1Desired: amount1,
            amount0Min: 0n,
            amount1Min: 0n,
            recipient: user,
            deadline,
          },
        ],
      }),
    );
  }
}
