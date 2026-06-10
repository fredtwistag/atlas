"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { getApi } from "@/server/trpc/caller";

/** Manager/sponsor approves an opportunity → persists SOW + flips status. */
export async function approveOpportunity(
  sprintId: string,
  oppId: string,
): Promise<void> {
  const session = await getSession();
  if (
    !session ||
    session.kind !== "tenant" ||
    !(session.role === "manager" || session.role === "sponsor")
  ) {
    throw new Error("forbidden");
  }
  const api = await getApi();
  await api.opportunity.approve({ id: oppId });
  revalidatePath(`/sprint/${sprintId}/opportunity/${oppId}`);
  revalidatePath(`/sprint/${sprintId}`);
}
