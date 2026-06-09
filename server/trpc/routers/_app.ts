import { router } from "../trpc";
import { sprintRouter } from "./sprint";
import { opportunityRouter } from "./opportunity";
import { sessionRouter } from "./session";
import { twistagRouter } from "./twistag";

export const appRouter = router({
  sprint: sprintRouter,
  opportunity: opportunityRouter,
  session: sessionRouter,
  twistag: twistagRouter,
});

export type AppRouter = typeof appRouter;
