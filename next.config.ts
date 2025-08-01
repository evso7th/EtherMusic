
import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  /* config options here */
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
            test: /autopilot-worker\.ts$/,
            loader: 'worker-loader',
            options: {
                filename: 'static/chunks/[name].[contenthash].js',
                publicPath: '/_next/',
            },
        });
    }
    return config;
  }
};

export default nextConfig;
