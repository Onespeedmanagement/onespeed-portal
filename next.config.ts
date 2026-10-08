import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  serverExternalPackages: ['unpdf'],
  experimental: { serverActions: { bodySizeLimit: '20mb' } },
};

export default nextConfig;
