import { z } from "zod";

/**
 * Centralized environment-variable contract. See plan 022.
 *
 * Two tiers:
 *  - Always required: the Supabase + DB connection vars the app cannot boot
 *    without, in ANY environment.
 *  - Required only in production: email, LLM, public URL, and the direct DB
 *    connection — the things that fail SILENTLY today (sendEmail no-ops without
 *    RESEND_API_KEY, robots/sitemap fall back to a hardcoded host, etc.).
 *
 * `validateEnv()` throws ONE error listing EVERY missing/invalid key (not
 * first-fail) so an operator fixes the whole set in one pass. It NEVER echoes a
 * value — names only — so logs stay free of secrets.
 *
 * IMPORTANT — this module is deliberately NOT called at build time. `next build`
 * runs with NODE_ENV=production but does NOT have the prod-only secrets present
 * in local/CI, so calling validateEnv() from next.config.mjs would break the
 * shared `npm run verify` gate for every other plan. It is instead wired into
 * the SERVER RUNTIME boot path (instrumentation.ts `register()`), guarded to be
 * a no-op during `next build` and outside production. See instrumentation.ts.
 */

/** True only while `next build` is collecting the build — never at runtime. */
export const isNextBuildPhase = () =>
  process.env.NEXT_PHASE === "phase-production-build";

// Always-required keys: present in every environment (dev, CI, prod).
const alwaysRequired = {
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  DATABASE_URL: z.string().min(1),
} as const;

// Observability keys: ALWAYS optional, in every environment including prod.
// See plan 023. The DSN is deliberately never required — a missing DSN must not
// be able to break boot or build. With no DSN, Sentry is a no-op (init never
// runs) and the app behaves identically. So these live OUTSIDE the prod-only
// tier on purpose: the worst case of an unset DSN is "no error tracking", which
// must never crash a deploy the way a missing RESEND_API_KEY does.
const observability = {
  // Server DSN. Optional, validated as a URL only when present.
  SENTRY_DSN: z.string().url().optional(),
  // Browser DSN (public). Optional; usually the same DSN as the server.
  NEXT_PUBLIC_SENTRY_DSN: z.string().url().optional(),
} as const;

// Inngest (background workers, plan 020). ALWAYS optional, like observability:
// the serve handler reads them straight from the env, and a missing key must
// never break boot or build — unconfigured, `inngest.send` is a local no-op and
// functions are inert. In prod they SHOULD be set (background work won't run
// otherwise), but we deliberately do NOT make them required so an unset key can
// never crash a deploy the way a missing RESEND_API_KEY does.
const inngestKeys = {
  INNGEST_EVENT_KEY: z.string().min(1).optional(),
  INNGEST_SIGNING_KEY: z.string().min(1).optional(),
} as const;

// Prod-only keys: optional in dev (the app no-ops), required in production.
const prodOnly = {
  RESEND_API_KEY: z.string().min(1),
  EMAIL_FROM: z
    .string()
    .min(1)
    .refine((v) => !v.includes("resend.dev"), {
      message:
        "must not use the resend.dev sandbox sender (spam-foldered); set a verified-domain sender",
    }),
  ANTHROPIC_API_KEY: z.string().min(1),
  APP_URL: z.string().url().startsWith("https://", {
    message: "must be an https:// URL in production",
  }),
  DIRECT_URL: z.string().min(1),
} as const;

/**
 * Build the schema for the current NODE_ENV. In production the prod-only keys
 * are required AND two cross-field refinements apply:
 *  - DATABASE_URL must hit the TRANSACTION pooler (`:6543`) at runtime.
 *  - DIRECT_URL must be the SESSION/direct connection (`:5432`) for migrations.
 */
function schemaFor(prod: boolean) {
  if (!prod) {
    // Dev/CI: prod-only keys are optional, refinements relaxed.
    return z.object({
      ...alwaysRequired,
      ...observability,
      ...inngestKeys,
      RESEND_API_KEY: prodOnly.RESEND_API_KEY.optional(),
      EMAIL_FROM: prodOnly.EMAIL_FROM.optional(),
      ANTHROPIC_API_KEY: prodOnly.ANTHROPIC_API_KEY.optional(),
      APP_URL: z.string().url().optional(),
      DIRECT_URL: prodOnly.DIRECT_URL.optional(),
    });
  }
  return z
    .object({
      ...alwaysRequired,
      ...observability,
      ...inngestKeys,
      ...prodOnly,
    })
    .refine((e) => e.DATABASE_URL.includes(":6543"), {
      path: ["DATABASE_URL"],
      message:
        "in production must point at the Supabase TRANSACTION pooler (port :6543)",
    })
    .refine((e) => e.DIRECT_URL.includes(":5432"), {
      path: ["DIRECT_URL"],
      message:
        "in production must be the SESSION/direct connection (port :5432) for migrations",
    });
}

export type Env = z.infer<ReturnType<typeof schemaFor>>;

/**
 * Validate `source` (defaults to `process.env`) against the tier-appropriate
 * schema. The tier is chosen from `source.NODE_ENV` so tests can pass a prod-
 * shaped object without mutating the read-only global `process.env.NODE_ENV`.
 * Throws a single Error naming EVERY failing key (never the values). Returns the
 * parsed env on success. Idempotent and cheap — safe to call on each boot.
 */
export function validateEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const prod = source.NODE_ENV === "production";
  const result = schemaFor(prod).safeParse(source);
  if (result.success) return result.data;

  const lines = result.error.issues.map((issue) => {
    const key = issue.path.join(".") || "(root)";
    return `  - ${key}: ${issue.message}`;
  });
  const mode = prod ? "production" : (source.NODE_ENV ?? "development");
  throw new Error(
    `Invalid environment (${mode}). Fix these variables — see ` +
      `docs/runbooks/deploy.md §5:\n${lines.join("\n")}`,
  );
}

/**
 * Typed getters. These read `process.env` directly (no global cache) so they
 * stay correct if the process env is mutated in tests. Use these instead of
 * sprinkling `process.env.X` at call sites.
 */
export const env = {
  /** Public base URL; falls back to the canonical host for robots/sitemap. */
  appUrl(): string {
    return process.env.APP_URL ?? "https://atlas.twistag.com";
  },
  resendApiKey(): string | undefined {
    return process.env.RESEND_API_KEY;
  },
  anthropicApiKey(): string | undefined {
    return process.env.ANTHROPIC_API_KEY;
  },
  databaseUrl(): string | undefined {
    return process.env.DATABASE_URL;
  },
  /**
   * Sentry DSN (server/edge). Undefined when observability is not configured —
   * callers treat that as "Sentry disabled" and init a no-op. Optional in every
   * environment (see `observability` in the schema): a missing DSN must never
   * break boot or build.
   */
  sentryDsn(): string | undefined {
    return process.env.SENTRY_DSN;
  },
} as const;
