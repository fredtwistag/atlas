import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { Context } from "./context";

const t = initTRPC.context<Context>().create({ transformer: superjson });

export const router = t.router;
export const publicProcedure = t.procedure;
export const createCallerFactory = t.createCallerFactory;

/** Requires a tenant session; narrows ctx.session to the tenant kind. */
export const tenantProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.session || ctx.session.kind !== "tenant") {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({ ctx: { session: ctx.session } });
});
