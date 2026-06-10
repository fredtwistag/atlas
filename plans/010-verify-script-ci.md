# 010 — verify script + CI format gate (D10)

**Base commit:** `5eff48f` · **Plan:** D10 · **Category:** DX · **Risk:** LOW

## Change
- Add to `package.json` scripts:
  `"verify": "npm run typecheck && npm run lint && npm test && npm run test:integration && npm run build"`
- Add a `npm run format:check` step to `.github/workflows/ci.yml` (the prettier gate).
- Document `npm run verify` in `README.md`.

## TDD
Config change — no unit test. Validate by running `npm run verify` end-to-end.

## Gate
`npm run verify` green.
