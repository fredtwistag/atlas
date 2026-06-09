import EmbeddedPostgres from "embedded-postgres";
import { rmSync } from "node:fs";
import { runMigrations } from "../migrate";

const PORT = 5433;
const DATA_DIR = "./.pgdata-test";
const TEST_URL = `postgresql://postgres:postgres@localhost:${PORT}/atlas_test`;

export default async function setup(): Promise<() => Promise<void>> {
  // If an external test DB is provided, use it as-is (e.g. a system Postgres).
  if (process.env.DATABASE_URL_TEST) {
    await runMigrations(process.env.DATABASE_URL_TEST, { withBootstrap: true });
    return async () => {};
  }

  rmSync(DATA_DIR, { recursive: true, force: true });
  const pg = new EmbeddedPostgres({
    databaseDir: DATA_DIR,
    user: "postgres",
    password: "postgres",
    port: PORT,
    persistent: false,
  });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase("atlas_test");

  await runMigrations(TEST_URL, { withBootstrap: true });
  process.env.DATABASE_URL = TEST_URL;
  process.env.DATABASE_URL_TEST = TEST_URL;

  return async () => {
    await pg.stop();
    rmSync(DATA_DIR, { recursive: true, force: true });
  };
}
