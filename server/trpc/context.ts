import { getSession } from "@/lib/session";
import type { Claims } from "@/lib/auth-claims";

/** Per-request tRPC context: the verified session (or null). */
export async function createContext(): Promise<{ session: Claims }> {
  return { session: await getSession() };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
