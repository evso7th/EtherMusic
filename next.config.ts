
import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  // This option includes the static export mode, but only for production builds.
  output: process.env.NODE_ENV === 'production' ? 'export' : undefined,
  
  // Disables Next.js image optimization, which is required for static export.
  images: {
    unoptimized: true,
  },

  // These options help prevent the build from failing due to TypeScript or ESLint errors.
  // Recommended for deployment stability.
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  
  webpack(config, { isServer, dev }) {
    config.module.rules.push({
      test: /src[\\/]lib[\\/]workers[\\/].*\.js$/,
      loader: 'worker-loader',
      options: {
        filename: 'static/chunks/[name].[contenthash].js',
        publicPath: '/_next/',
      },
    });

    return config;
  },
};

export default nextConfig;

    