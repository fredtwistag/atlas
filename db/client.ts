import postgres from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import * as schema from "./schema";

export type Db = PostgresJsDatabase<typeof schema>;
export type TenantClaims = { tenantId: string; userId: string; role: string };

function connectionUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return url;
}

/**
 * postgres-js pool options. `DATABASE_URL` must point at Supabase's
 * TRANSACTION-mode pooler (port 6543) so connections return to the pooler
 * after each transaction instead of being pinned per-client (session mode,
 * port 5432, which exhausts the 15-client cap under normal concurrency).
 *
 * - `prepare: false` is REQUIRED for the transaction pooler — named prepared
 *   statements can't be reused across the pooler's rotating backends.
 * - `idle_timeout` releases idle connections; `max_lifetime` recycles them.
 * - `max` is per-process; keep it low (serverless multiplies it across
 *   instances). Override with `DB_POOL_MAX` (e.g. 1 on Vercel).
 *
 * Migrations use a SESSION/direct connection (see db/migrate.ts + DIRECT_URL).
 */
function poolOptions(): postgres.Options<Record<string, never>> {
  return {
    max: Number(process.env.DB_POOL_MAX ?? 5),
    idle_timeout: 20,
    max_lifetime: 60 * 30,
    prepare: false,
    onnotice: () => {},
  };
}

// Lazily create one pool per process.
let _client: ReturnType<typeof postgres> | null = null;
let _db: Db | null = null;

function db(): Db {
  if (!_db) {
    _client = postgres(connectionUrl(), poolOptions());
    _db = drizzle(_client, { schema });
  }
  return _db;
}

/** For tests that boot embedded-pg after import: point the pool at a URL. */
export function configureDb(url: string): void {
  void _client?.end();
  _client = postgres(url, poolOptions());
  _db = drizzle(_client, { schema });
}

/**
 * Run `fn` as the `authenticated` role with the given JWT claims set, so RLS
 * policies (auth.jwt() ->> 'tenant_id') apply. Everything runs in one
 * transaction; SET LOCAL resets on commit/rollback.
 */
export async function withTenantContext<T>(
  claims: TenantClaims,
  fn: (tx: Db) => Promise<T>,
): Promise<T> {
  const claimsJson = JSON.stringify({
    sub: claims.userId,
    // `user_id` mirrors the production access-token hook (0001) so RLS policies
    // keyed on auth.jwt() ->> 'user_id' — e.g. session_messages' owner-only
    // SELECT — behave identically here and in Supabase.
    user_id: claims.userId,
    tenant_id: claims.tenantId,
    role: claims.role,
  });
  return db().transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL ROLE authenticated`);
    await tx.execute(
      sql`SELECT set_config('request.jwt.claims', ${claimsJson}, true)`,
    );
    return fn(tx as unknown as Db);
  });
}

/**
 * Run `fn` as the service_role (BYPASSRLS). For seeding, admin, and cross-tenant
 * operations only. Writes an audit_log row before running fn.
 *
 * `tenantId`/`userId`/`targetId` fill the matching audit_log columns so admin
 * actions are queryable by the audit viewer; they're optional so legacy 2-field
 * callers keep compiling. `metadata` merges with `{actor}` (actor always wins).
 * We deliberately do NOT derive `user_id` from `actor` — some actors are
 * non-uuid sentinels ("test"/"dev"/"seed").
 *
 * `skipAudit` suppresses the audit_log write for HIGH-FREQUENCY infrastructure
 * actions that would otherwise flood the audit table — specifically the
 * per-request rate-limit check (action "rate.limit", see lib/rate-limit.ts),
 * which can fire on every sign-in/OTP/nudge attempt. It is intended ONLY for
 * that action; security-relevant admin/cross-tenant operations must stay audited,
 * so leave `skipAudit` unset everywhere else.
 */
export async function withServiceRole<T>(
  audit: {
    action: string;
    actor: string;
    tenantId?: string;
    userId?: string;
    targetId?: string;
    metadata?: Record<string, unknown>;
    skipAudit?: boolean;
  },
  fn: (tx: Db) => Promise<T>,
): Promise<T> {
  const metaJson = JSON.stringify(audit.metadata ?? {});
  return db().transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL ROLE service_role`);
    if (!audit.skipAudit) {
      await tx.execute(
        sql`INSERT INTO public.audit_log (action, tenant_id, user_id, target_id, metadata)
            VALUES (
              ${audit.action},
              ${audit.tenantId ?? null}::uuid,
              ${audit.userId ?? null}::uuid,
              ${audit.targetId ?? null},
              ${metaJson}::jsonb || jsonb_build_object('actor', ${audit.actor}::text)
            )`,
      );
    }
    return fn(tx as unknown as Db);
  });
}

/**
 * Run `fn` with a Twistag (cross-tenant) read context: the `*_twistag_read`
 * RLS policies (USING twistag_role IS NOT NULL) grant SELECT across all
 * tenants. The read runs as the `authenticated` role with a twistag_role
 * claim — NOT a service-role bypass. The access is audit-logged (written as
 * service_role first, in the same transaction).
 *
 * Read-only by intent: tenant insert/update policies require a tenant_id match,
 * which a twistag claim does not have, so writes here would be denied anyway.
 */
export async function withTwistagContext<T>(
  audit: {
    twistagRole: string;
    actor: string;
    tenantId?: string;
    targetId?: string;
  },
  fn: (tx: Db) => Promise<T>,
): Promise<T> {
  const claimsJson = JSON.stringify({
    sub: audit.actor,
    twistag_role: audit.twistagRole,
  });
  return db().transaction(async (tx) => {
    // Audit the cross-tenant read as service_role (authenticated lacks INSERT
    // on audit_log). tenant_id/target_id record what was read, when known.
    await tx.execute(sql`SET LOCAL ROLE service_role`);
    await tx.execute(
      sql`INSERT INTO public.audit_log (action, tenant_id, target_id, metadata)
          VALUES ('twistag.read',
                  ${audit.tenantId ?? null}::uuid,
                  ${audit.targetId ?? null},
                  jsonb_build_object('actor', ${audit.actor}::text,
                                     'twistag_role', ${audit.twistagRole}::text))`,
    );
    // Switch to authenticated + twistag claims for the actual reads.
    await tx.execute(sql`SET LOCAL ROLE authenticated`);
    await tx.execute(
      sql`SELECT set_config('request.jwt.claims', ${claimsJson}, true)`,
    );
    return fn(tx as unknown as Db);
  });
}

/**
 * Run `fn` as `supabase_auth_admin` — the role Supabase Auth executes the access
 * token hook as. Test/seed utility so we can exercise the hook the way GoTrue does.
 */
export async function withAuthAdmin<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
  return db().transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL ROLE supabase_auth_admin`);
    return fn(tx as unknown as Db);
  });
}
