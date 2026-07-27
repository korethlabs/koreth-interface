# Koreth Interface

The **Koreth** dApp — a Next.js (App Router) frontend for depositing LP positions as
collateral, borrowing stablecoins, supplying to markets, and managing positions.

Built with wagmi + viem + ConnectKit for wallet/RPC, TanStack Query for data, Tailwind for
styling, and the [`@koreth/sdk`](https://github.com/korethlabs/koreth-sdk) for shared types.
Indexed data comes from [`koreth-subgraph`](https://github.com/korethlabs/koreth-subgraph).

## Stack

- **Next.js 15** (App Router, React 19)
- **wagmi / viem / ConnectKit** — wallet + contract calls
- **@tanstack/react-query** — async state
- **Tailwind CSS v4**
- **@koreth/sdk** — protocol types (installed as a git dependency)

## Generated contract bindings

Addresses and ABIs are generated from the core Foundry build into `src/generated/`
(gitignored). Run after deploying `koreth-v1-core` locally:

```bash
# reads koreth-v1-core/out + koreth-v1-core/deployments/local.json (override with CORE_ROOT)
npm run prepare-frontend
```

This writes `src/generated/deployments.ts` (addresses/chainId) and `src/generated/abis.ts`
(typed `as const` ABIs).

## Develop

```bash
npm install            # installs deps incl. @koreth/sdk over SSH
npm run prepare-frontend
npm run dev            # http://localhost:3000
```

## Build

```bash
npm run build
npm start
```

## License

`MIT` (see [LICENSE](./LICENSE)).
