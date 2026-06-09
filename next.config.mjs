/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Prototypes are static HTML reference, not part of the build.
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
