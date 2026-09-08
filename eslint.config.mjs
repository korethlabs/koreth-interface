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
])

export default eslintConfig
