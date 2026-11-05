#!/usr/bin/env node
// CI only. Fails unless koreth-v1-core's sources are actually present at CORE_ROOT, before anything
// compiles or reads them.
//
// A checkout that succeeds is not the same as one that delivered the tree, and what makes a thin tree
// dangerous here is the build cache: "Cache core build" restores core/out from an earlier run before
// anything compiles, so every artifact prepare-frontend reads can already be on disk whether or not
// its source arrived. Measured: with out/ from a full build in place and src/core/LendingEngine.sol
// removed, out/LendingEngine.sol/LendingEngine.json is still there afterwards. Today "Build core"
// happens to exit 1 in that state, but only because something core does not skip still imports the
// missing file — an accident of core's layout, not a property this job controls. This check makes it
// one: the sources prepare-frontend depends on are asserted present, by name, before the cache or
// the compiler can stand in for them.
//
// What is checked is derived from ABI_ARTIFACTS, the same table prepare-frontend reads, so the set of
// sources required can never drift from the set of artifacts consumed: forge names each artifact
// directory after its source file, so "LendingPool.sol/LendingPool.json" needs a LendingPool.sol
// somewhere under src/. Submodules are checked too, because core's sources import from lib/.
import {execFileSync} from "node:child_process";
import {existsSync, readdirSync} from "node:fs";
import {join} from "node:path";
import {ABI_ARTIFACTS} from "./core-artifacts.mjs";

const root = process.env.CORE_ROOT;
if (!root) throw new Error("CORE_ROOT is not set");

const problems = [];

if (!existsSync(join(root, "foundry.toml"))) problems.push(`${root}/foundry.toml is missing`);

const srcDir = join(root, "src");
const present = new Set();
if (existsSync(srcDir)) {
    for (const entry of readdirSync(srcDir, {recursive: true})) {
        present.add(String(entry).split("/").pop());
    }
} else {
    problems.push(`${srcDir} is missing`);
}
for (const artifact of Object.values(ABI_ARTIFACTS)) {
    const source = artifact.split("/")[0];
    if (!present.has(source)) problems.push(`no ${source} under ${srcDir} (needed for ${artifact})`);
}

// A leading "-" is an uninitialised submodule; anything git cannot answer is a failure in itself.
if (existsSync(join(root, ".gitmodules"))) {
    try {
        const status = execFileSync("git", ["-C", root, "submodule", "status", "--recursive"], {encoding: "utf8"});
        const missing = status.split("\n").filter((l) => l.startsWith("-")).map((l) => l.trim().split(/\s+/)[1]);
        if (status.trim() === "") problems.push(`${root}/.gitmodules lists submodules but none are initialised`);
        for (const path of missing) problems.push(`submodule ${path} is not initialised`);
    } catch (err) {
        problems.push(`git submodule status failed in ${root}: ${err.message}`);
    }
}

if (problems.length > 0) {
    for (const p of problems) console.log(`::error::${p}`);
    console.log("::error::koreth-v1-core did not arrive intact, so no bindings can be generated from it.");
    process.exit(1);
}
console.log(`core checkout ok: foundry.toml, ${Object.keys(ABI_ARTIFACTS).length} ABI sources, submodules initialised`);
