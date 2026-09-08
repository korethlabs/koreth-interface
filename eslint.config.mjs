import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

// Flat config, because `next lint` no longer exists: Next 16 removed the subcommand, so `next lint`
// was parsed as a positional directory argument and the script failed with "no such directory:
// .../lint" rather than with anything about linting. eslint-config-next@16 exports flat config
// arrays directly from `.`, `/core-web-vitals` and `/typescript`, so no @eslint/eslintrc FlatCompat
// shim is needed — verified by requiring the package: core-web-vitals is a 4-element array whose
// entries already carry `files`, `plugins` and `rules`.
const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  // eslint-config-next ships these ignores itself, but a `globalIgnores` anywhere in the array
  // replaces nothing — ignores accumulate — so they are restated here to keep the full ignore set
  // readable in one place rather than half of it living inside a dependency.
  globalIgnores([
    // Default ignores of eslint-config-next:
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',

    // Written by `npm run prepare-frontend` from koreth-v1-core's forge output and gitignored.
    // Not ignored to hide findings: it is transcribed ABI data, so a lint error there is a bug in
    // scripts/prepare-frontend.mjs and must be fixed at the generator, never in the file. Nothing
    // is lost by skipping it because the *use* of these bindings is in src/, which is linted, and
    // the file's own correctness is checked by tsc.
    'src/generated/**',
  ]),

  {
    rules: {
      // Off because what it reports on does not happen in this build. The rule's own message is
      // "React Compiler has skipped optimizing this component because the existing manual
      // memoization could not be preserved" — a claim about the output of a compiler that never
      // runs here, and a compiler that never runs cannot skip anything. Verified against this
      // tree: next.config.js contains no `reactCompiler` key, Next 16's own default for it is
      // unset (`defaultConfig.reactCompiler` and `defaultConfig.experimental.reactCompiler` both
      // come back null when required from next/dist/server/config-shared), and
      // babel-plugin-react-compiler is not installed — package-lock.json mentions it only as an
      // optional peerDependency of `next`, and `npm ls babel-plugin-react-compiler` reports an
      // empty tree. Every useMemo here is therefore executed exactly as written, and a finding
      // that an optimisation was dropped describes an optimisation that was never attempted.
      //
      // Switched off here rather than at the call site, deliberately. An inline disable comment is
      // a directive the next person copies to the next site that trips the rule, and each copy
      // carries the exemption without the argument for it. One switch, one argument, one place to
      // revisit.
      //
      // RE-ENABLE THIS RULE in whatever change enables the React Compiler. From that point the
      // rule stops describing a hypothetical build and starts reporting memoization genuinely lost
      // in compilation — which for src/hooks/useAcceptedCollateral.ts, the only site that currently
      // trips it, would mean the classification of every whitelisted pool being redone on renders
      // where none of its inputs moved.
      'react-hooks/preserve-manual-memoization': 'off',
    },
  },
])

export default eslintConfig
