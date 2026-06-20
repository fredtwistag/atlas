import { z } from "zod";

export const InviteOrgSchema = z.object({
  orgName: z.string().min(2),
  orgSlug: z
    .string()
    .min(2)
    .regex(/^[a-z0-9-]+$/, "lowercase letters, numbers, hyphens"),
  segment: z.string().min(2),
  // Optional company website/domain — the CTX-2 enrichment targeting hint.
  orgDomain: z.string().trim().optional(),
  managerName: z.string().min(2),
  managerEmail: z.string().email(),
});
export type InviteOrgInput = z.infer<typeof InviteOrgSchema>;

export const InviteMemberSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  role: z.enum(["ic", "sponsor"]),
});
export type InviteMemberInput = z.infer<typeof InviteMemberSchema>;
