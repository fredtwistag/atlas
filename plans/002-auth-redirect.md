# 002 — Validate the post-login redirect (A2)

**Base commit:** `5eff48f` · **Plan:** A2 · **Category:** Security · **Risk:** LOW

## Problem
`app/auth/callback/route.ts` concatenates `?next=` onto origin unvalidated:
`return NextResponse.redirect(`${origin}${dest}`)` where `dest = explicitNext`.
A `next` like `.evil.com/x` yields `https://origin.com.evil.com/x` — open redirect.

## Change
Extract a pure helper `safeNext(next: string | null): string | null` that accepts `next`
only when it is a **same-origin relative path**:
- must start with `/`
- must **not** start with `//` or `/\`
- must **not** contain `:`

Otherwise return `null`, and the callback falls back to `landingPathFor(role)`
(already imported). Keep the existing role-based default path behavior.

## TDD
Co-locate `app/auth/callback/safe-next.test.ts` (or similar) testing `safeNext`:
- `/me` → `/me`
- `.evil.com/x` → `null`
- `//evil.com` → `null`
- `/\evil.com` → `null`
- `https://evil.com` → `null`
- `/path?x=1` → `/path?x=1` (relative with query is fine)
- `null`/`""` → `null`

Watch it fail (helper doesn't exist) first.

## Gate
`npm test`. Manually exercise `?next=.evil.com/x` → falls back to role landing path.
