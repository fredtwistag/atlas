import { router } from "../trpc";
import { sprintRouter } from "./sprint";
import { opportunityRouter } from "./opportunity";

export const appRouter = router({
  sprint: sprintRouter,
  opportunity: opportunityRouter,
});

export type AppRouter = typeof appRouter;
