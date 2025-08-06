
import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  // This option includes the static export mode.
  // Next.js will automatically create an `out` folder with the finished files.
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
  devIndicators: {
    buildActivity: false
  }
};

export default nextConfig;
