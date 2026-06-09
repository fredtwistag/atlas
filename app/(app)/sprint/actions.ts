"use server";

import { redirect } from "next/navigation";
import { getApi } from "@/server/trpc/caller";
import { LaunchSprintSchema } from "@/lib/schemas";

/** Manager submits the launch form → creates the sprint → redirect to it. */
export async function launchSprint(formData: FormData): Promise<void> {
  const parsed = LaunchSprintSchema.safeParse({
    name: formData.get("name"),
    primaryFocus: formData.get("primaryFocus"),
    topicKeys: formData.getAll("topicKeys"),
    participantIds: formData.getAll("participantIds"),
  });
  if (!parsed.success) {
    redirect("/sprint?error=invalid");
  }

  const api = await getApi();
  const sprintId = await api.sprint.launch(parsed.data);
  redirect(`/sprint/${sprintId}`);
}
