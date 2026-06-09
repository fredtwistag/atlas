# 04 — Design System

> Linear-sharp UI · Vanta/Thoropass task structure · light theme · Inter + Fraunces.

---

## 1. Design language

- **Light primary** for trust signal (B2B SaaS convention)
- **Linear DNA:** Inter Variable with font features, tight tracking on titles, 6-8px radii, border-driven separation (not shadows)
- **Vanta/Thoropass DNA:** task-driven flows, manager-visible accountability, progress bars
- **Editorial:** Fraunces for marketing pages and final report (gives Atlas a serious, document-grade voice)
- **Single accent:** indigo (`#4f46e5`) used sparingly — for surfacing/discovery moments, primary CTAs, brand moments

## 2. Tokens

See `design/tokens.css` for the full file. Key tokens:

```css
:root {
  /* Surface */
  --bg: #fafafa;
  --surface: #ffffff;
  --surface-2: #f4f4f5;

  /* Foreground */
  --text: #09090b;
  --text-2: #52525b;
  --text-3: #a1a1aa;

  /* Borders */
  --border: #e4e4e7;
  --border-strong: #d4d4d8;

  /* Brand */
  --brand: #4f46e5;
  --brand-soft: #eef2ff;

  /* Semantic */
  --success: #16a34a;
  --success-soft: #f0fdf4;
  --warning: #d97706;
  --warning-soft: #fffbeb;
  --danger: #dc2626;
  --danger-soft: #fef2f2;

  /* Radii */
  --radius: 8px;
  --radius-sm: 6px;
  --radius-lg: 12px;

  /* Shadows */
  --shadow-sm: 0 1px 2px 0 rgba(0,0,0,0.04);
  --shadow: 0 1px 3px 0 rgba(0,0,0,0.06), 0 1px 2px 0 rgba(0,0,0,0.04);
  --shadow-lg: 0 10px 30px -10px rgba(0,0,0,0.18), 0 4px 12px -4px rgba(0,0,0,0.08);
}
```

## 3. Typography

- **UI font:** Inter Variable (Google Fonts)
- **Editorial font:** Fraunces Variable (for marketing + report headlines only)
- **Mono:** JetBrains Mono (for kbd, code, terminal-style visuals)
- **Font features:** `'cv02', 'cv03', 'cv04', 'cv11', 'ss01'`

### Scale

| Token | Size | Line | Weight | Tracking | Use |
|---|---|---|---|---|---|
| `text-xs` | 11px | 1.5 | 500 | 0.04em | Labels, badges |
| `text-sm` | 12.5px | 1.5 | 400 | 0 | Secondary text |
| `text-base` | 14px | 1.55 | 400 | 0 | Body |
| `text-md` | 14.5px | 1.6 | 500 | -0.005em | Manager UI, table cells |
| `text-lg` | 16px | 1.4 | 600 | -0.01em | Card titles |
| `text-xl` | 18px | 1.3 | 600 | -0.015em | Section heads |
| `text-2xl` | 22px | 1.2 | 600 | -0.02em | Page subheads |
| `text-3xl` | 28px | 1.2 | 600 | -0.02em | Page titles |
| `text-4xl` | 42px | 1.1 | 500 (Fraunces) | -0.025em | Hero subhead |
| `text-5xl` | 56px | 1.05 | 500 (Fraunces) | -0.03em | Hero |
| `text-6xl` | 72px | 1.0 | 500 (Fraunces) | -0.035em | Landing hero |

## 4. Components

### Tier-1 (build first)
- `Button` — primary, secondary, ghost, danger variants; sizes sm, md, lg
- `Input` — text, email, number; focus state with indigo ring
- `Textarea` — auto-resize, focus ring
- `Select` — native styled
- `Card` — surface + border + radius-lg
- `Avatar` — color-hashed by name; sizes sm (24), md (28), lg (44)
- `Badge` — semantic colors (active, idle, blocked, done, warn)
- `ProgressBar` — horizontal, with optional segments
- `Stepper` — sidebar variant (sprint setup) + inline variant
- `TopNav` — brand logo + breadcrumb + actions
- `Sidenav` — sections, items, count badges, alert dots

### Tier-2 (build as needed)
- `ChatMessage` — bot, user, typing indicator
- `OpportunityCard` — list and detail variants
- `EvidenceQuote` — left border + quote text + role attribution
- `Tabs` — underline style
- `Dialog` — centered modal
- `Sheet` — right slide-over (used for SOW preview)
- `Toast` — bottom-right notifications
- `EmptyState` — illustration + title + sub + CTA

### Tier-3 (later)
- `DataTable` — sortable, filterable (use TanStack Table)
- `Calendar` — date picker
- `Combobox` — search + select
- `Tooltip`
- `Popover`

## 5. Layout patterns

### Sprint manager dashboard
- Top nav (52px sticky)
- Sub-header (24px padding, with sprint context pill)
- Stat strip (4 stats in 4 cols)
- 2-col content (1.6fr / 1fr) — team table left, opportunities right
- Activity feed below opportunities

### IC session
- Top header (16px padding, brand + breadcrumb)
- Main: 2-col (1fr / 320px)
  - Left: conversation thread
  - Right: "What Atlas heard" side panel
- Input area pinned bottom

### Final report
- Linear A4-like pages
- Cover page = inverted (black bg, paper text)
- Body pages = paper bg, Fraunces titles, Inter body
- Page numbers + footer line bottom of each

## 6. Screen inventory

| Screen | Prototype file | Status |
|---|---|---|
| IC email invite (visual ref) | `prototypes/atlas-ic-journey.html` screen 1 | proto |
| IC welcome + privacy | `prototypes/atlas-ic-journey.html` screen 2 | proto |
| IC pre-session brief | `prototypes/atlas-ic-journey.html` screen 3 | proto |
| IC conversation | `prototypes/atlas-ic-journey.html` screen 4 | proto — **hero** |
| IC completion | `prototypes/atlas-ic-journey.html` screen 5 | proto |
| IC personal dashboard | `prototypes/atlas-ic-dashboard.html` | proto |
| IC edit captured | `prototypes/atlas-ic-edit-capture.html` | proto |
| Manager sprint setup wizard | `prototypes/atlas-sprint-setup.html` | proto |
| Manager dashboard | `prototypes/atlas-manager-dashboard.html` | proto |
| Sponsor exec view (toggle) | `prototypes/atlas-manager-dashboard.html` | proto |
| Manager nudge composer | `prototypes/atlas-manager-nudge.html` | proto |
| Opportunity detail | `prototypes/atlas-opportunity-detail.html` | proto — **hero** |
| Approve-for-FDE sheet | (in opportunity detail) | proto |
| Twistag cockpit (overview) | `prototypes/atlas-twistag-cockpit.html` | proto |
| Twistag client drill-down | `prototypes/atlas-twistag-cockpit.html` | proto |
| Pattern library | `prototypes/atlas-twistag-cockpit.html` | proto |
| Empty / error states | `prototypes/atlas-states.html` | proto |
| Final report | `prototypes/atlas-final-report.html` | proto |
| Marketing landing | `prototypes/atlas-landing.html` | proto |
| Pricing | `prototypes/atlas-pricing.html` | proto |

## 7. Accessibility

- All interactive elements keyboard-navigable
- Focus rings always visible
- Contrast: AA minimum (4.5:1 for text, 3:1 for UI)
- All buttons + interactive icons have `aria-label`
- Live regions for chat (`role="log"`, `aria-live="polite"`)
- Reduced motion: respect `prefers-reduced-motion` (no animations on chat scroll, no typing pulse)

## 8. Mobile-responsive (not mobile-first)

- All ICs use mobile occasionally — sessions must work at 375px width
- Manager + Twistag-side are desktop-primary, but should remain navigable on tablet (768px+)
- No mobile-native apps in MVP

Key breakpoints:
- `< 700px` — IC mobile session
- `< 900px` — table-to-card collapse
- `< 1100px` — 2-col → 1-col
- `< 1280px` — Twistag cockpit drops sidenav

## 9. Style guide / tone

### Voice
- Honest, specific, direct
- Banned: leverage, unlock, seamless, robust, empower, game-changer, cutting-edge
- Use active voice
- Avoid corporate hedging ("we'd suggest considering")

### Microcopy
- Buttons: verb-led ("Send", "Approve", "Continue")
- Errors: explain + remedy ("This link expired. Get a new one")
- Empty states: friendly, useful, never apologetic

### Numbers
- Currency: `$48K` not `$48,000` for headlines; full form `$48,000` in tables
- Percentages: integer-precision ("78% complete")
- Ranges: en-dash ("$180K – $240K")
- Time: "5 min 12s", "2-4 days"
