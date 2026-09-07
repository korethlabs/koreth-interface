/** @type {import('next').NextConfig} */
const nextConfig = {
  // Only here because Next refuses to start a Turbopack build that has a webpack config and no
  // Turbopack one. Nothing needs configuring: Turbopack tree-shakes the unused re-exports out of
  // the `wagmi/connectors` barrel, so the modules ignored below never enter its graph at all.
  // Should one of them ever become reachable, Turbopack fails with module-not-found at build
  // time rather than emitting a stub that throws later; the fix then is `turbopack.resolveAlias`
  // mapping each specifier onto a stub module.
  turbopack: {},

  // webpack keeps those re-exports, so the barrel pulls @coinbase/cdp-sdk into *its* graph, and
  // with it the optional @x402/* payment modules we never install. webpack resolves them eagerly
  // and fails, so ignoring the namespace is what keeps any webpack-backed build alive — whichever
  // connectors the app happens to construct, since the barrel is what drags them in. This whole
  // file can go once `grep -rIl "@x402/" node_modules` comes back empty.
  webpack: (config, { webpack }) => {
    config.plugins.push(
      new webpack.IgnorePlugin({ resourceRegExp: /^@x402\// })
    );
    return config;
  },
};

module.exports = nextConfig;
