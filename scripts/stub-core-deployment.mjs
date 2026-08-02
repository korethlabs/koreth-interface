#!/usr/bin/env node
// CI only. Writes a placeholder koreth-v1-core/deployments/local.json.
//
// prepare-frontend.mjs builds src/generated from two things: ABIs out of core's forge output,
// and addresses out of deployments/local.json. That JSON is written by the deploy script against
// a running anvil and is gitignored, so it never exists in a fresh clone — which would leave CI
// unable to compile the interface at all.
//
// The ABIs are the half that actually type-checks the app against the contracts, so CI compiles
// core for real and only the addresses are synthesized. To the type checker an address is an
// opaque string, so placeholders check exactly as well as real ones; each key gets a distinct
// value so nothing can pass by comparing two addresses that only happen to match.
//
// Usage: CORE_ROOT=/path/to/koreth-v1-core node scripts/stub-core-deployment.mjs
import {mkdirSync, writeFileSync} from "node:fs";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";
import {DEPLOYMENT_KEYS, NUMERIC_KEYS} from "./core-artifacts.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const contractsRoot = process.env.CORE_ROOT || join(here, "..", "..", "koreth-v1-core");

let nth = 0;
const deployment = Object.fromEntries(
    DEPLOYMENT_KEYS.map((key) => {
        if (NUMERIC_KEYS.has(key)) return [key, key === "chainId" ? 1337 : 0];
        return [key, `0x${(++nth).toString(16).padStart(40, "0")}`];
    }),
);

const outPath = join(contractsRoot, "deployments", "local.json");
mkdirSync(dirname(outPath), {recursive: true});
writeFileSync(outPath, `${JSON.stringify(deployment, null, 2)}\n`);
console.log(`stub -> ${outPath}`);
