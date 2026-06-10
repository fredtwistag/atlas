/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Lint runs in CI and is no longer ignored at build time.
  // Optional: build into a separate output dir (e.g. `.next-verify`) so
  // `next build` can run without clobbering a concurrent `next dev`'s `.next`.
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
};

export default nextConfig;
