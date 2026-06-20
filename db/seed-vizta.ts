/**
 * Demo seed — extends the EXISTING "Vizta" tenant for an end-to-end dogfood.
 *
 * Vizta (a Portuguese real-estate developer converting to an SGOEC) already
 * exists with an ingested briefing.md + draft company context. This seed adds
 * the people and sprint needed to run the discovery flow: a sponsor (Vera), 3
 * ICs mapped to the real directorates (Comercial, Gestão de Projetos,
 * Financeiro), a backdated active sprint (past the day-7 surfacing gate), 3
 * topics, participants, and one session per IC. Then mints Supabase auth users
 * so every persona shows up in /sign-in/dev.
 *
 * Idempotent: fixed UUIDs + onConflictDoNothing. Prints persona + session ids.
 *
 * Run: npm run db:seed:vizta
 */
import { eq, and } from "drizzle-orm";
import { withServiceRole } from "./client";
import {
  tenants,
  twistagUsers,
  users,
  sprints,
  topics,
  sprintParticipants,
  sessions,
} from "./schema";
import { createAdminClient } from "../lib/supabase/admin";

const TENANT_ID = "3dbb4f16-9e71-4136-aed0-d0d85292b22b"; // existing Vizta

const ID = {
  sprint: "5ad70000-0000-4000-8000-000000000010",
  topicComercial: "5ad70000-0000-4000-8000-000000000021",
  topicProjetos: "5ad70000-0000-4000-8000-000000000022",
  topicFinanceiro: "5ad70000-0000-4000-8000-000000000023",
  sponsor: "5ad70000-0000-4000-8000-000000000032",
  sofia: "5ad70000-0000-4000-8000-000000000041",
  ricardo: "5ad70000-0000-4000-8000-000000000042",
  ines: "5ad70000-0000-4000-8000-000000000043",
  sessSofia: "5ad70000-0000-4000-8000-000000000051",
  sessRicardo: "5ad70000-0000-4000-8000-000000000052",
  sessInes: "5ad70000-0000-4000-8000-000000000053",
} as const;

const SUPER_ADMIN = {
  email: "admin@twistag.com",
  name: "Avery Stone",
  role: "twistag_admin",
};

const SPONSOR = {
  id: ID.sponsor,
  email: "vera@vizta.pt",
  name: "Vera Almeida",
  role: "sponsor",
  department: "Administração",
  title: "Administradora (Sponsor)",
};

const ICS = [
  {
    id: ID.sofia,
    email: "sofia@vizta.pt",
    name: "Sofia Marques",
    role: "ic",
    department: "Comercial",
    title: "Diretora Comercial",
  },
  {
    id: ID.ricardo,
    email: "ricardo@vizta.pt",
    name: "Ricardo Tavares",
    role: "ic",
    department: "Gestão de Projetos",
    title: "Diretor de Gestão de Projetos",
  },
  {
    id: ID.ines,
    email: "ines@vizta.pt",
    name: "Inês Costa",
    role: "ic",
    department: "Financeiro",
    title: "Diretora Financeira",
  },
];

async function main(): Promise<void> {
  await withServiceRole(
    { action: "seed.vizta", actor: "seed" },
    async (tx) => {
      await tx.insert(twistagUsers).values(SUPER_ADMIN).onConflictDoNothing();

      const [tenant] = await tx
        .select({ id: tenants.id })
        .from(tenants)
        .where(eq(tenants.id, TENANT_ID));
      if (!tenant) throw new Error("Vizta tenant not found — unexpected.");

      // Existing manager (fred+1@twistag.com). Fall back to creating one.
      let [manager] = await tx
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.tenantId, TENANT_ID), eq(users.role, "manager")));
      if (!manager) {
        const [m] = await tx
          .insert(users)
          .values({
            tenantId: TENANT_ID,
            email: "manager@vizta.pt",
            name: "Gestor Vizta",
            role: "manager",
            department: "Operações",
            title: "Gestor do Sprint",
          })
          .returning({ id: users.id });
        manager = m;
      }

      for (const u of [SPONSOR, ...ICS]) {
        await tx
          .insert(users)
          .values({ tenantId: TENANT_ID, ...u })
          .onConflictDoNothing();
      }

      await tx
        .insert(sprints)
        .values({
          id: ID.sprint,
          tenantId: TENANT_ID,
          name: "Discovery Operacional — Q2",
          scopeDepartment: "Transversal (6 direções)",
          primaryFocus: "operational-discovery",
          // Backdated ~2 weeks so recompute's day-7 surfacing gate is met.
          startDate: "2026-06-06",
          endDate: "2026-07-04",
          cadence: "weekly",
          status: "active",
          sponsorId: ID.sponsor,
          managerId: manager.id,
        })
        .onConflictDoNothing();

      const TOPICS = [
        {
          id: ID.topicComercial,
          title: "Ciclo comercial e geração de CPCVs",
          description:
            "Do primeiro contacto ao CPCV assinado: passos, sistemas, e onde o ciclo trava.",
          orderIdx: 1,
          questionCount: 6,
          estMinutes: 8,
        },
        {
          id: ID.topicProjetos,
          title: "Gestão de obra: mapas de quantidades e handoffs",
          description:
            "Como se produzem mapas de quantidades e como flui o handoff venda → escritura → obra.",
          orderIdx: 2,
          questionCount: 6,
          estMinutes: 8,
        },
        {
          id: ID.topicFinanceiro,
          title: "Fecho financeiro e reconciliação de pagamentos",
          description:
            "Fecho mensal, reconciliação de pagamentos de clientes, e o novo reporting da SGOEC.",
          orderIdx: 3,
          questionCount: 6,
          estMinutes: 8,
        },
      ];
      for (const t of TOPICS) {
        await tx
          .insert(topics)
          .values({ tenantId: TENANT_ID, sprintId: ID.sprint, ...t })
          .onConflictDoNothing();
      }

      const SESSIONS = [
        { id: ID.sessSofia, userId: ID.sofia, topicId: ID.topicComercial },
        { id: ID.sessRicardo, userId: ID.ricardo, topicId: ID.topicProjetos },
        { id: ID.sessInes, userId: ID.ines, topicId: ID.topicFinanceiro },
      ];
      for (const ic of ICS) {
        await tx
          .insert(sprintParticipants)
          .values({
            tenantId: TENANT_ID,
            sprintId: ID.sprint,
            userId: ic.id,
            status: "active",
            sessionsCompleted: 0,
            sessionsTotal: 1,
            lastActiveLabel: "Convidado",
          })
          .onConflictDoNothing();
      }
      for (const s of SESSIONS) {
        await tx
          .insert(sessions)
          .values({
            id: s.id,
            tenantId: TENANT_ID,
            sprintId: ID.sprint,
            topicId: s.topicId,
            userId: s.userId,
            status: "not_started",
          })
          .onConflictDoNothing();
      }
    },
  );

  // Auth users so every persona can one-click sign in via /sign-in/dev.
  const admin = createAdminClient();
  const emails = [SUPER_ADMIN.email, SPONSOR.email, ...ICS.map((i) => i.email)];
  for (const email of emails) {
    const { error } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
    });
    if (error && !/already|exists|registered/i.test(error.message)) {
      throw new Error(`createUser(${email}): ${error.message}`);
    }
  }

  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        ok: true,
        tenantId: TENANT_ID,
        sprintId: ID.sprint,
        sessions: {
          "sofia@vizta.pt": { sessionId: ID.sessSofia, userId: ID.sofia, topic: "Ciclo comercial e geração de CPCVs" },
          "ricardo@vizta.pt": { sessionId: ID.sessRicardo, userId: ID.ricardo, topic: "Gestão de obra: mapas de quantidades e handoffs" },
          "ines@vizta.pt": { sessionId: ID.sessInes, userId: ID.ines, topic: "Fecho financeiro e reconciliação de pagamentos" },
        },
      },
      null,
      2,
    ),
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
