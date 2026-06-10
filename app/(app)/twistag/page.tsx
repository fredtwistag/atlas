import { redirect } from "next/navigation";

// The cockpit now lives at /admin (the home for all Twistag roles). This route
// stays as a permanent redirect so older links keep working.
export default function TwistagRedirect() {
  redirect("/admin");
}
