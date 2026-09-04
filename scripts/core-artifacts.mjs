// The surface the interface consumes from koreth-v1-core, shared between the real generator
// (prepare-frontend.mjs) and the CI stub (stub-core-deployment.mjs) so the two cannot drift:
// a key the app relies on but the stub forgets would fail CI for a reason that has nothing to
// do with the change under test.

/**
 * Keys read out of core's deployments/local.json, in the order they are emitted.
 *
 * No collateral pair appears here. Which pools the protocol accepts is a set it curates through
 * whitelist events, and naming one of them in a generated config would be a second copy of that set
 * for the app to trust; the app enumerates it from the index and confirms it against ProtocolCore.
 */
export const DEPLOYMENT_KEYS = [
    "chainId", "deployBlock", "core", "positionManager", "lendingEngine", "liquidationEngine",
    "riskManager", "priceFeedRegistry", "v2Adapter", "v3Adapter", "weth", "usdc", "usdt", "dai",
];

/** Exported ABI name -> forge artifact path under core's out/. ERC20 comes from viem instead. */
export const ABI_ARTIFACTS = {
    positionManagerAbi: "PositionManager.sol/PositionManager.json",
    lendingEngineAbi: "LendingEngine.sol/LendingEngine.json",
    lendingPoolAbi: "LendingPool.sol/LendingPool.json",
    interestRateModelAbi: "InterestRateModel.sol/InterestRateModel.json",
    lpOracleHubAbi: "LPOracleHub.sol/LPOracleHub.json",
    riskManagerAbi: "RiskManager.sol/RiskManager.json",
    protocolCoreAbi: "ProtocolCore.sol/ProtocolCore.json",
    circuitBreakerAbi: "CircuitBreaker.sol/CircuitBreaker.json",
};

/** Which keys are numbers rather than addresses — the stub and the emitter both need this. */
export const NUMERIC_KEYS = new Set(["chainId", "deployBlock"]);
