/** @type {import('next').NextConfig} */
const nextConfig = {
  // Turbopack builds every module below fine and needs no equivalent of the webpack plugin
  // further down: it tolerates the unresolved optional imports that webpack fails on. The only
  // reason this key exists is that Next 16, which builds with Turbopack by default, refuses to
  // start at all when it finds a webpack config and no Turbopack one — it assumes the webpack
  // config was meant to be migrated and stops rather than guessing. There is nothing to migrate,
  // so an empty object is the acknowledgement of that, not a port of anything.
  //
  // Do not read this as "the webpack config below is obsolete". It is still the only thing
  // standing between the build and a resolution failure whenever webpack is the bundler, which
  // is the default on Next 15 and remains available on Next 16 via `next build --webpack`.
  turbopack: {},

  // Only ever reached under webpack. wagmi's Base Account connector reaches @coinbase/cdp-sdk,
  // which statically imports optional @x402/* payment modules that we neither use nor install.
  // The connector is never constructed here — only `injected()` is — but the connectors barrel
  // re-exports it, so those modules are in the graph regardless and webpack resolves them
  // eagerly. Ignoring the whole namespace is what keeps the build from failing on them.
  webpack: (config, { webpack }) => {
    config.plugins.push(
      new webpack.IgnorePlugin({ resourceRegExp: /^@x402\// })
    );
    return config;
  },
};

module.exports = nextConfig;
