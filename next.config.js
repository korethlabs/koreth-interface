/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { webpack }) => {
    // wagmi's Base Account connector (@coinbase/cdp-sdk) references optional
    // @x402/* payment modules that we don't use and don't install. Ignore the
    // whole namespace so the build doesn't fail resolving them.
    config.plugins.push(
      new webpack.IgnorePlugin({ resourceRegExp: /^@x402\// })
    );
    return config;
  },
};

module.exports = nextConfig;
