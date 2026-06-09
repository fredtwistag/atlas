import { eq } from "drizzle-orm";
import { db as mock } from "../lib/data";
import { withServiceRole } from "./client";
import { createAdminClient } from "../lib/supabase/admin";
import {
  tenants,
  users,
  sprints,
  topics,
  sprintParticipants,
  sessions,
  opportunities,
  captures,
  opportunityEvidence,
} from "./schema";

const SPRINT_ID = "5f1b2c00-0000-4000-8000-000000000001";

async function main(): Promise<void> {
  const sprint = await mock.sprint.get();
  const opps = await mock.opportunity.listForSprint();

  const emails = await withServiceRole(
    { action: "seed.dashboard", actor: "seed" },
    async (tx) => {
      const [t] = await tx
        .select()
        .from(tenants)
        .where(eq(tenants.slug, "northwind"));
      if (!t)
        throw new Error("Run `npm run db:seed` first (Northwind missing).");
      const tenantId = t.id;

      // Idempotent: clear this tenant's dashboard rows before reseeding.
      await tx
        .delete(opportunityEvidence)
        .where(eq(opportunityEvidence.tenantId, tenantId));
      await tx.delete(captures).where(eq(captures.tenantId, tenantId));
      await tx
        .delete(opportunities)
        .where(eq(opportunities.tenantId, tenantId));
      await tx.delete(sessions).where(eq(sessions.tenantId, tenantId));
      await tx
        .delete(sprintParticipants)
        .where(eq(sprintParticipants.tenantId, tenantId));
      await tx.delete(topics).where(eq(topics.tenantId, tenantId));

      // Roster: manager + sponsor + participants, with titles/departments.
      // Upsert titles so evidence role attribution is correct even for users
      // created earlier (by the auth seed) without titles.
      const roster = [
        sprint.manager,
        sprint.sponsor,
        ...sprint.participants.map((p) => p.user),
      ];
      for (const u of roster) {
        await tx
          .insert(users)
          .values({
            tenantId,
            email: u.email,
            name: u.name,
            role: u.role,
            department: u.department,
            title: u.title,
          })
          .onConflictDoUpdate({
            target: [users.tenantId, users.email],
            set: {
              name: u.name,
              role: u.role,
              department: u.department,
              title: u.title,
            },
          });
      }
      const dbUsers = await tx
        .select()
        .from(users)
        .where(eq(users.tenantId, tenantId));
      const byEmail = new Map(dbUsers.map((u) => [u.email, u]));
      const byTitle = new Map(dbUsers.map((u) => [u.title ?? "", u]));
      const managerId = byEmail.get(sprint.manager.email)?.id;

      // Sprint (fixed id for stable links).
      await tx
        .insert(sprints)
        .values({
          id: SPRINT_ID,
          tenantId,
          name: sprint.name,
          scopeDepartment: sprint.scopeDepartment,
          primaryFocus: sprint.primaryFocus,
          startDate: "2026-05-18",
          endDate: "2026-06-12",
          cadence: sprint.cadence,
          status: "active",
          sponsorId: byEmail.get(sprint.sponsor.email)?.id,
          managerId,
        })
        .onConflictDoNothing();

      // Topics.
      for (const top of sprint.topics) {
        await tx
          .insert(topics)
          .values({
            tenantId,
            sprintId: SPRINT_ID,
            title: top.title,
            description: top.description,
            orderIdx: top.orderIdx,
            questionCount: top.questionCount,
            estMinutes: top.estMinutes,
          })
          .onConflictDoNothing();
      }

      // Participants.
      for (const p of sprint.participants) {
        const uid = byEmail.get(p.user.email)?.id;
        if (!uid) continue;
        await tx
          .insert(sprintParticipants)
          .values({
            tenantId,
            sprintId: SPRINT_ID,
            userId: uid,
            status: p.status,
            sessionsCompleted: p.sessionsCompleted,
            sessionsTotal: p.sessionsTotal,
            lastActiveLabel: p.lastActiveLabel,
          })
          .onConflictDoNothing();
      }

      // Sessions: one per participant × topic. The first `sessionsCompleted`
      // topics (in order) are marked complete so the IC's /me is real.
      const dbTopics = await tx
        .select()
        .from(topics)
        .where(eq(topics.tenantId, tenantId))
        .orderBy(topics.orderIdx);
      for (const p of sprint.participants) {
        const uid = byEmail.get(p.user.email)?.id;
        if (!uid) continue;
        for (let i = 0; i < dbTopics.length; i++) {
          const done = i < p.sessionsCompleted;
          await tx.insert(sessions).values({
            tenantId,
            sprintId: SPRINT_ID,
            topicId: dbTopics[i].id,
            userId: uid,
            status: done ? "completed" : "not_started",
            totalSeconds: done ? 360 : null,
            messagesCount: done ? 11 : 0,
            captureCount: done ? 5 : 0,
            completedAt: done ? new Date("2026-05-25T12:00:00Z") : null,
            editWindowEndsAt: done ? new Date("2026-06-01T12:00:00Z") : null,
          });
        }
      }

      // Opportunities + evidence captures.
      for (const o of opps) {
        const [oppRow] = await tx
          .insert(opportunities)
          .values({
            tenantId,
            sprintId: SPRINT_ID,
            title: o.title,
            description: o.description,
            category: o.category,
            departments: o.departments,
            impactLow: o.impactLow,
            impactHigh: o.impactHigh,
            timeToShipWeeksLow: o.timeToShipWeeksLow,
            timeToShipWeeksHigh: o.timeToShipWeeksHigh,
            confidenceScore: o.confidenceScore,
            compositeScore: String(o.compositeScore),
            dimensionScores: o.dimensionScores,
            rationale: o.rationale,
            status: o.status,
            contributorCount: o.contributorCount,
            patternMatch: o.patternMatch ?? null,
          })
          .returning();

        for (const ev of o.evidence) {
          const contributor = byTitle.get(ev.contributorRole)?.id ?? managerId;
          if (!contributor) continue;
          const [cap] = await tx
            .insert(captures)
            .values({
              tenantId,
              userId: contributor,
              kind: ev.kind,
              summary: ev.summary,
              sourceQuote: ev.sourceQuote,
              tags: ev.tags,
            })
            .returning();
          await tx
            .insert(opportunityEvidence)
            .values({
              tenantId,
              opportunityId: oppRow.id,
              captureId: cap.id,
            })
            .onConflictDoNothing();
        }
      }

      return roster.map((u) => u.email);
    },
  );

  // Auth users so every persona can sign in via the dev shortcut.
  const admin = createAdminClient();
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
    `dashboard seed complete — sprint ${SPRINT_ID}, ${opps.length} opportunities`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
