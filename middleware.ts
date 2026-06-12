import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

const PUBLIC_PATHS = ["/", "/pricing"];

function isPublic(path: string): boolean {
  return (
    PUBLIC_PATHS.includes(path) ||
    path.startsWith("/sign-in") ||
    path.startsWith("/auth")
  );
}

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // Fast path: an anonymous hit on a public page carries no Supabase auth
  // cookies, so there is no session to refresh and no access to gate — skip the
  // getUser() round-trip entirely. INVARIANT: a request WITH `sb-` cookies (a
  // signed-in user) still falls through to getUser() below even on public
  // paths, so session-cookie refresh keeps working for them.
  const hasAuthCookies = request.cookies
    .getAll()
    .some((c) => c.name.startsWith("sb-"));
  if (isPublic(path) && !hasAuthCookies) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANT: getUser() refreshes the session cookie. Don't run logic between
  // createServerClient and getUser().
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !isPublic(path)) {
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
