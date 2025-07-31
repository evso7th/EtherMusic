
import type {NextConfig} from 'next';

const withPWA = require('next-pwa')({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development',
});


const nextConfig: NextConfig = {
  /* config options here */
  output: 'export',
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
    ],
  },
  devIndicators: false,
  // This is needed to allow cross-origin requests in the dev environment.
  allowedDevOrigins: ['**.cloudworkstations.dev'],
  webpack: (config, { isServer }) => {
    if (!isServer) {
        config.module.rules.push({
            test: /\.worker\.ts$/,
            loader: 'worker-loader',
            options: {
                filename: 'static/[name].[contenthash].js',
                publicPath: '/_next/',
            },
        });
    }
    return config;
  }
};

export default withPWA(nextConfig);
