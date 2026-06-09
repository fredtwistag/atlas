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

// Lazily create one pool per process.
let _client: ReturnType<typeof postgres> | null = null;
let _db: Db | null = null;

function db(): Db {
  if (!_db) {
    _client = postgres(connectionUrl(), { max: 10, onnotice: () => {} });
    _db = drizzle(_client, { schema });
  }
  return _db;
}

/** For tests that boot embedded-pg after import: point the pool at a URL. */
export function configureDb(url: string): void {
  void _client?.end();
  _client = postgres(url, { max: 5, onnotice: () => {} });
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
 */
export async function withServiceRole<T>(
  audit: { action: string; actor: string },
  fn: (tx: Db) => Promise<T>,
): Promise<T> {
  return db().transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL ROLE service_role`);
    await tx.execute(
      sql`INSERT INTO public.audit_log (action, metadata)
          VALUES (${audit.action}, jsonb_build_object('actor', ${audit.actor}::text))`,
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
