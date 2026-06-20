/**
 * Dogfood helper — drive a seeded IC session through the REAL conversation
 * engine (openSession + takeTurn loop), then complete it (inline final
 * extraction). Role-played answers are grounded in Vizta's ingested briefing.
 *
 * This exists so we can generate enough cross-IC conversation volume for the
 * opportunity engine without hand-clicking every multi-turn LLM exchange in the
 * browser. One IC (Sofia) is instead driven live in the browser as the UX test.
 *
 * Prints arc progression, per-turn latency, and capture summaries so we can
 * judge extraction quality. Run:
 *   ATLAS_INLINE_SESSION_EXTRACTION=1 npx tsx --tsconfig scripts/tsconfig.json \
 *     --env-file=.env.local scripts/sim-session.ts <email|all>
 */
import { and, asc, eq } from "drizzle-orm";
import { withServiceRole, withTenantContext } from "@/db/client";
import { sessions, captures } from "@/db/schema";
import { openSession, takeTurn } from "@/services/conversation/engine";
import { completeSessionForUser } from "@/lib/sessions";

process.env.ATLAS_INLINE_SESSION_EXTRACTION = "1";

const SESSION_IDS: Record<string, string> = {
  "ricardo@vizta.pt": "5ad70000-0000-4000-8000-000000000052",
  "ines@vizta.pt": "5ad70000-0000-4000-8000-000000000053",
  "sofia@vizta.pt": "5ad70000-0000-4000-8000-000000000051",
};

const SCRIPTS: Record<string, string[]> = {
  "ricardo@vizta.pt": [
    "Sou o Ricardo, diretor de Gestão de Projetos. Temos 6 obras a decorrer em simultâneo e mais 12 projetos no pipeline. O meu dia divide-se entre controlar custos de obra e resolver bloqueios entre direções.",
    "Os mapas de quantidades são o que mais tempo consome. Os projetistas mandam-nos os mapas em Excel, cada um num formato diferente, e a minha equipa passa-os à mão para o nosso template de orçamentação. São facilmente 2 a 3 dias por obra, e há sempre erros de transcrição que só aparecem já em obra.",
    "Por empreitada perdemos uns 4 a 5 dias úteis só a normalizar e reconciliar mapas. Com 6 obras ativas é quase uma pessoa a tempo inteiro só nisto.",
    "O handoff venda → escritura → obra é o outro ponto crítico. Quando o Comercial fecha um CPCV, os dados do comprador e do imóvel chegam-nos por email ou por uma folha partilhada, não vêm diretos do Dynamics. Reintroduzimos tudo no sistema de gestão de obra.",
    "Já começámos a planear obra com dados desatualizados porque a versão que recebemos não era a final do Comercial. Atrasou o arranque de uma obra cerca de duas semanas.",
    "As vistorias em campo são em papel ou fotos no telemóvel dos técnicos. Depois alguém transcreve para o sistema; perde-se contexto e há fotos que nunca chegam ao registo do imóvel.",
    "O novo ERP é uma oportunidade, mas receio que avance antes de decidirmos o que deve ser nativo no Business Central e o que deve ser uma camada à parte. Se não ficar claro, construímos à pressa e refazemos.",
    "Se me perguntar onde dói mais: mapas de quantidades, sem dúvida. É repetitivo, manual, e o erro custa caro já em obra. Para mim é o primeiro candidato.",
  ],
  "ines@vizta.pt": [
    "Inês Costa, diretora financeira. A minha maior preocupação agora é a conversão para SGOEC — muda o reporting e a governance, e a equipa é pequena para o que aí vem.",
    "O fecho mensal demora-nos hoje 8 a 10 dias úteis. Grande parte é reconciliação de pagamentos de clientes — recebemos transferências sem identificação e temos de as casar à mão com os contratos.",
    "São uns 150 a 200 pagamentos por mês para reconciliar, e cada um pode levar vários minutos quando a referência não bate certo. É a Joana e mais uma pessoa praticamente uma semana por mês só nisto.",
    "Trabalhamos em Business Central, mas muita coisa vive em Excel ao lado — mapas de tesouraria, controlo de recebimentos por projeto. Há reconciliação dupla entre o Excel e o BC.",
    "Com a SGOEC vamos ter obrigações de reporting ao regulador e aos investidores que hoje não temos. Se o fecho já leva 10 dias, não sei como cumprimos prazos mais apertados sem mudar o processo.",
    "A reconciliação podia ser muito mais automática — a maioria dos casos é matching por valor e referência, regras simples. Só uma minoria precisa mesmo de análise humana.",
    "O risco que vejo é decidirmos isto à pressa por causa do calendário do ERP. Preferia que o Discovery dissesse claramente o que é automação de regras e o que é mesmo AI — não é tudo a mesma coisa.",
    "Se tivesse de escolher uma coisa para começar: automatizar a reconciliação de pagamentos. Liberta a equipa a tempo da SGOEC e melhora a qualidade do reporting.",
  ],
};

async function runOne(email: string): Promise<void> {
  const sessionId = SESSION_IDS[email];
  const messages = SCRIPTS[email];
  if (!sessionId || !messages) throw new Error(`no script for ${email}`);

  const [s] = await withServiceRole(
    { action: "dev.sim.lookup", actor: "sim" },
    (tx) =>
      tx
        .select({ tenantId: sessions.tenantId, userId: sessions.userId })
        .from(sessions)
        .where(eq(sessions.id, sessionId)),
  );
  if (!s) throw new Error(`session ${sessionId} not found`);

  const claims = { tenantId: s.tenantId, userId: s.userId, role: "ic" as const };
  const arcTrace: string[] = [];

  const opener = await withTenantContext(claims, (tx) =>
    openSession({ db: tx, tenantId: s.tenantId, sessionId, userId: s.userId }),
  );
  arcTrace.push(`INTRO:${opener.arc}`);
  // eslint-disable-next-line no-console
  console.log(`\n[${email}] opener (${opener.arc}):\n  ${opener.assistant}\n`);

  let done = false;
  for (let i = 0; i < messages.length && !done; i++) {
    const t0 = Date.now();
    const r = await withTenantContext(claims, (tx) =>
      takeTurn({
        db: tx,
        tenantId: s.tenantId,
        sessionId,
        userId: s.userId,
        userMessage: messages[i],
      }),
    );
    const ms = Date.now() - t0;
    done = r.done;
    arcTrace.push(r.arc);
    // eslint-disable-next-line no-console
    console.log(
      `[${email}] turn ${i + 1} (${r.arc}, ${ms}ms, done=${r.done}) captured ${r.captures.length}:`,
    );
    for (const c of r.captures) {
      // eslint-disable-next-line no-console
      console.log(`    • [${c.kind}] ${c.summary}`);
    }
    // eslint-disable-next-line no-console
    console.log(`  Atlas: ${r.assistant.slice(0, 220)}${r.assistant.length > 220 ? "…" : ""}\n`);
  }

  await completeSessionForUser(claims, sessionId);

  const caps = await withTenantContext(claims, (tx) =>
    tx
      .select({ kind: captures.kind, summary: captures.summary })
      .from(captures)
      .where(and(eq(captures.sessionId, sessionId), eq(captures.userId, s.userId)))
      .orderBy(asc(captures.createdAt)),
  );
  // eslint-disable-next-line no-console
  console.log(
    `[${email}] COMPLETE — arc trace: ${arcTrace.join(" → ")} — ${caps.length} captures total`,
  );
}

async function main(): Promise<void> {
  const arg = process.argv[2] ?? "all";
  const targets =
    arg === "all" ? Object.keys(SCRIPTS) : [arg];
  for (const email of targets) {
    await runOne(email);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
