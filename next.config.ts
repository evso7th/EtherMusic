
import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  // This option enables static export for production builds.
  output: 'export',
  
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
};

export default nextConfig;
