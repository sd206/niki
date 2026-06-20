/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  transpilePackages: ['@niki/shared'],
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
