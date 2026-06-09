import { router } from "../trpc";
import { sprintRouter } from "./sprint";
import { opportunityRouter } from "./opportunity";
import { sessionRouter } from "./session";

export const appRouter = router({
  sprint: sprintRouter,
  opportunity: opportunityRouter,
  session: sessionRouter,
});

export type AppRouter = typeof appRouter;
