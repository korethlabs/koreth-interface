// The surface the interface consumes from koreth-v1-core, shared between the real generator
// (prepare-frontend.mjs) and the CI stub (stub-core-deployment.mjs) so the two cannot drift:
// a key the app relies on but the stub forgets would fail CI for a reason that has nothing to
// do with the change under test.

/** Keys read out of core's deployments/local.json, in the order they are emitted. */
export const DEPLOYMENT_KEYS = [
    "chainId", "deployBlock", "core", "positionManager", "lendingEngine", "liquidationEngine",
    "riskManager", "priceFeedRegistry", "v2Adapter", "v3Adapter", "weth", "usdc", "usdt", "dai", "v2Pair",
];

/** Exported ABI name -> forge artifact path under core's out/. ERC20 comes from viem instead. */
export const ABI_ARTIFACTS = {
    positionManagerAbi: "PositionManager.sol/PositionManager.json",
    lendingEngineAbi: "LendingEngine.sol/LendingEngine.json",
    lendingPoolAbi: "LendingPool.sol/LendingPool.json",
    interestRateModelAbi: "InterestRateModel.sol/InterestRateModel.json",
    lpOracleHubAbi: "LPOracleHub.sol/LPOracleHub.json",
};

/** Which keys are numbers rather than addresses — the stub and the emitter both need this. */
export const NUMERIC_KEYS = new Set(["chainId", "deployBlock"]);
