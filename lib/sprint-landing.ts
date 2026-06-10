/**
 * Where a tenant user lands once the current sprint id is known. The
 * manager/sponsor split happens here (not in landingPathFor, which runs before
 * we know the id): sponsors get the executive report, managers get the
 * operational dashboard, and everyone else goes to their own page.
 */
export function sprintLandingPath(role: string, sprintId: string): string {
  if (role === "sponsor") return `/sprint/${sprintId}/report`;
  if (role === "manager") return `/sprint/${sprintId}`;
  return "/me";
}
