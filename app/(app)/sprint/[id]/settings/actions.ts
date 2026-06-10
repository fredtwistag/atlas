"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getApi } from "@/server/trpc/caller";

/** Edit a sprint's name / primary focus. Guarded by sprint.update (managerProcedure). */
export async function updateSprintAction(
  id: string,
  formData: FormData,
): Promise<void> {
  const name = String(formData.get("name") ?? "").trim();
  const primaryFocus = String(formData.get("primaryFocus") ?? "").trim();

  const api = await getApi();
  try {
    await api.sprint.update({ id, name, primaryFocus });
  } catch {
    redirect(`/sprint/${id}/settings?error=invalid`);
  }
  revalidatePath(`/sprint/${id}`);
  revalidatePath(`/sprint/${id}/settings`);
  redirect(`/sprint/${id}/settings?saved=1`);
}

/** Close (complete) a sprint, then send the manager to the discovery report. */
export async function closeSprintAction(id: string): Promise<void> {
  const api = await getApi();
  await api.sprint.close({ id });
  revalidatePath(`/sprint/${id}`);
  revalidatePath("/sprint");
  redirect(`/sprint/${id}/report`);
}
