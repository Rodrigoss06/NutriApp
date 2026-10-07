import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // packages/ui se publica como código fuente (TSX y CSS): Next.js lo compila.
  transpilePackages: ['@nutricoach/ui'],
};

export default nextConfig;
