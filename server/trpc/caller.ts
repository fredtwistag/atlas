import { createCallerFactory } from "./trpc";
import { appRouter } from "./routers/_app";
import { createContext } from "./context";

const createCaller = createCallerFactory(appRouter);

/** Per-request server caller for Server Components (reads cookies each call). */
export async function getApi() {
  return createCaller(await createContext());
}
