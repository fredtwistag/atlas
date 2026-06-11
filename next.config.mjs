/** @type {import('next').NextConfig} */
import { withSentryConfig } from "@sentry/nextjs";

// Baseline security headers applied to every response. See plan 018.
// CSP is REPORT-ONLY for launch week (logs violations without blocking) so a
// missed allowance can't break auth or fonts during the pilot. Flip to
// enforcing (`Content-Security-Policy`) within two weeks of launch and drop
// 'unsafe-eval' once verified unnecessary in production builds.
const cspReportOnly = [
  "default-src 'self'",
  // Supabase Auth + Postgrest + Realtime are reached from the browser.
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
  // data: covers inline SVG/base64 favicons and email-preview images.
  "img-src 'self' data:",
  // Next.js injects inline <style> for critical CSS; needs 'unsafe-inline'.
  "style-src 'self' 'unsafe-inline'",
  // Next runtime + React dev refresh need inline scripts; 'unsafe-eval' is the
  // dev-overlay/HMR allowance — remove after confirming prod builds don't need it.
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  // Fonts are self-hosted via next/font; restrict to same-origin + data:.
  "font-src 'self' data:",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  { key: "Content-Security-Policy-Report-Only", value: cspReportOnly },
];

const nextConfig = {
  reactStrictMode: true,
  // Pin the file-tracing root to this app. Next 15.3+ auto-infers a workspace
  // root and there's a stray lockfile in the home dir; without this, Vercel's
  // output-file tracing can resolve to the wrong directory. (import.meta.dirname
  // needs Node ≥ 20.11; engines pins ≥ 22.)
  outputFileTracingRoot: import.meta.dirname,
  // Lint runs in CI and is no longer ignored at build time.
  // Optional: build into a separate output dir (e.g. `.next-verify`) so
  // `next build` can run without clobbering a concurrent `next dev`'s `.next`.
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

// Plan 023: wrap with Sentry's build plugin (source maps + the /monitoring
// tunnel route that defeats ad-blockers). This ONLY changes build/upload
// behaviour — it does not touch `headers()` or `outputFileTracingRoot` above,
// which are spread through untouched. Source-map upload is gated on an auth
// token being present (operator sets SENTRY_AUTH_TOKEN in CI/Vercel); with no
// token the wrap is effectively a pass-through, so local/CI builds with NO
// Sentry env set still succeed.
const sentryBuildOptions = {
  // Org/project only matter for source-map upload; harmless when unset.
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  // Route browser error/trace requests through our origin so ad-blockers don't
  // drop them. Same-origin, so it needs no CSP connect-src widening (the CSP
  // already allows 'self'). See plan 023 STOP-condition note on CSP.
  tunnelRoute: "/monitoring",
  // Quiet the plugin unless we're actively debugging it.
  silent: !process.env.CI,
  // Don't fail the build if source maps can't upload (e.g. no auth token).
  // Essential for the no-DSN/no-token build to stay green.
  errorHandler: () => {},
  // Strip uploaded source maps from the client bundle (don't ship them public).
  sourcemaps: { deleteSourcemapsAfterUpload: true },
  // Tree-shake Sentry's debug logging out of the production client bundle.
  webpack: { treeshake: { removeDebugLogging: true } },
};

export default withSentryConfig(nextConfig, sentryBuildOptions);
