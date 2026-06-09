import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const here = dirname(fileURLToPath(import.meta.url));

export async function runMigrations(
  databaseUrl: string,
  opts: { withBootstrap: boolean },
): Promise<void> {
  const sql = postgres(databaseUrl, { max: 1, onnotice: () => {} });
  try {
    if (opts.withBootstrap) {
      const bootstrap = readFileSync(join(here, "bootstrap.sql"), "utf8");
      await sql.unsafe(bootstrap);
    }

    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS public.schema_migrations (
        filename text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    const dir = join(here, "migrations");
    const files = readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    for (const file of files) {
      const already = await sql`
        SELECT 1 FROM public.schema_migrations WHERE filename = ${file}
      `;
      if (already.length > 0) continue;
      const content = readFileSync(join(dir, file), "utf8");
      await sql.begin(async (tx) => {
        await tx.unsafe(content);
        await tx`INSERT INTO public.schema_migrations (filename) VALUES (${file})`;
      });
      // eslint-disable-next-line no-console
      console.log(`applied ${file}`);
    }
  } finally {
    await sql.end();
  }
}

// CLI entry: real project, no bootstrap.
const isCli = process.argv[1] === fileURLToPath(import.meta.url);
if (isCli) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set (load it from .env.local)");
  }
  runMigrations(url, { withBootstrap: false })
    .then(() => {
      // eslint-disable-next-line no-console
      console.log("migrations complete");
      process.exit(0);
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
