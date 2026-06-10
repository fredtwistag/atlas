/**
 * Post-sign-in landing path by role. Managers/sponsors go to their command
 * center (the sprint dashboard); Twistag staff to the admin/cockpit; ICs to /me.
 */
export function landingPathFor(role: string): string {
  if (role.startsWith("twistag")) return "/admin";
  if (role === "manager" || role === "sponsor") return "/sprint";
  return "/me";
}
