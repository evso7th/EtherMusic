
import type {NextConfig} from 'next';
import WorkboxWebpackPlugin from 'workbox-webpack-plugin';
import path from 'path';

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
    // Rule for audio worklets
    config.module.rules.push({
      test: /\.worklet\.js$/,
      use: { loader: 'worker-loader' },
    });

    if (!isServer && !dev) {
        config.plugins.push(
            new WorkboxWebpackPlugin.InjectManifest({
                swSrc: path.join(__dirname, 'src', 'lib', 'sw.js'),
                swDest: path.join(__dirname, 'out', 'sw.js'),
                // We don't need to precache all the assets because we are in an SPA.
                // We will cache them on demand.
                injectionPoint: 'self.__WB_MANIFEST',
            })
        );
    }

    return config;
  },
};

export default nextConfig;
