import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { withServiceRole } from "@/db/client";
import { twistagUsers, users, tenants } from "@/db/schema";
import { Logo } from "@/components/Logo";
import { Avatar } from "@/components/ui/Avatar";
import { landingPathFor } from "@/lib/landing";
import { devSignIn } from "../actions";

export const metadata = { title: "Dev sign-in · Atlas" };
export const dynamic = "force-dynamic";

export default async function DevSignIn() {
  if (process.env.NODE_ENV === "production") notFound();

  const { staff, members } = await withServiceRole(
    { action: "dev.list", actor: "dev" },
    async (tx) => {
      const staff = await tx.select().from(twistagUsers);
      const members = await tx
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          role: users.role,
          tenant: tenants.name,
        })
        .from(users)
        .leftJoin(tenants, eq(users.tenantId, tenants.id));
      return { staff, members };
    },
  );

  return (
    <main className="mx-auto max-w-lg px-6 py-16">
      <Logo />
      <h1 className="mt-6 text-2xl font-semibold tracking-tight">
        Dev sign-in
      </h1>
      <p className="mt-1 text-md text-text-2">
        One-click into any identity — no email needed. This page only exists in
        development.
      </p>

      <Section title="Twistag staff">
        {staff.map((s) => (
          <PersonaButton
            key={s.id}
            name={s.name}
            email={s.email}
            sub={s.role}
            next={landingPathFor(s.role)}
          />
        ))}
        {staff.length === 0 && <Empty>No Twistag staff seeded yet.</Empty>}
      </Section>

      <Section title="Organization members">
        {members.map((m) => (
          <PersonaButton
            key={m.id}
            name={m.name}
            email={m.email}
            sub={`${m.role} · ${m.tenant ?? "—"}`}
            next={landingPathFor(m.role)}
          />
        ))}
        {members.length === 0 && <Empty>No members yet.</Empty>}
      </Section>

      <a
        href="/sign-in"
        className="mt-8 inline-block text-sm font-medium text-brand hover:text-brand-hover"
      >
        Use a real magic link instead →
      </a>
    </main>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-8">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-text-3">
        {title}
      </h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function PersonaButton({
  name,
  email,
  sub,
  next,
}: {
  name: string;
  email: string;
  sub: string;
  next: string;
}) {
  return (
    <form action={devSignIn}>
      <input type="hidden" name="email" value={email} />
      <input type="hidden" name="next" value={next} />
      <button
        type="submit"
        className="flex w-full items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3 text-left transition-colors hover:border-border-strong hover:bg-surface-2"
      >
        <Avatar name={name} />
        <span className="min-w-0">
          <span className="block font-medium leading-tight">{name}</span>
          <span className="block text-sm text-text-3">{sub}</span>
        </span>
        <span className="ml-auto text-sm text-text-3">{email}</span>
      </button>
    </form>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-border px-4 py-3 text-sm text-text-3">
      {children}
    </p>
  );
}
