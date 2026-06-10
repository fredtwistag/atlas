/**
 * The app's public base URL for links inside emails. Set `APP_URL` in
 * production (e.g. https://atlas.twistag.com); falls back to localhost for dev.
 */
export function appUrl(): string {
  return (
    process.env.APP_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "http://localhost:3000"
  );
}
