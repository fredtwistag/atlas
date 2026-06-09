import { eq } from "drizzle-orm";
import { withServiceRole } from "./client";
import { tenants, users, twistagUsers } from "./schema";
import { createAdminClient } from "../lib/supabase/admin";

const SUPER_ADMIN = {
  email: "admin@twistag.com",
  name: "Avery Stone",
  role: "twistag_admin",
};
const ORG = {
  slug: "northwind",
  name: "Northwind Logistics",
  segment: "Mid-market · 3PL",
  status: "active",
};
const MANAGER = {
  email: "marcus@northwind.example",
  name: "Marcus Ortega",
  role: "manager",
};
const ICS = [
  { email: "priya@northwind.example", name: "Priya Nair", role: "ic" },
  { email: "tom@northwind.example", name: "Tom Becker", role: "ic" },
];

async function main(): Promise<void> {
  await withServiceRole({ action: "seed", actor: "seed" }, async (tx) => {
    await tx.insert(twistagUsers).values(SUPER_ADMIN).onConflictDoNothing();

    await tx.insert(tenants).values(ORG).onConflictDoNothing();
    const [t] = await tx
      .select()
      .from(tenants)
      .where(eq(tenants.slug, ORG.slug));

    await tx
      .insert(users)
      .values({ tenantId: t.id, ...MANAGER })
      .onConflictDoNothing();
    for (const ic of ICS) {
      await tx
        .insert(users)
        .values({ tenantId: t.id, ...ic })
        .onConflictDoNothing();
    }
  });

  const admin = createAdminClient();
  const emails = [SUPER_ADMIN.email, MANAGER.email, ...ICS.map((i) => i.email)];
  for (const email of emails) {
    const { error } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
    });
    if (error && !/already|exists|registered/i.test(error.message)) {
      throw new Error(`createUser(${email}): ${error.message}`);
    }
    // eslint-disable-next-line no-console
    console.log(`auth user ready: ${email}`);
  }
  // eslint-disable-next-line no-console
  console.log("seed complete");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
