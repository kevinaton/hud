---
name: hud-ui
description: HUD cyberpunk design system — pure-black canvas, cyan #0FB8C9 accent, Orbitron numerics, Oxanium body text, hazard-stripe dividers, grid overlay, sharp 2px radius. Tailwind v4 tokens, shadcn extension patterns, and the closed set of HUD components. Load this whenever a ticket touches `components/`, `app/**/page.tsx`, `app/**/layout.tsx`, fonts, or theme tokens. Matches Figma `node-id=305-2391` (login) and `node-id=309-631` (cashflow).
---

# HUD UI System

## Design intent

Cyberpunk operator console. Black canvas, faint technical grid, neon accents, sharp geometry. No skeuomorphism, no gradients, no rounded blobs. Numerics dominate — they're the data. Type is purposeful: display/numbers in Orbitron (geometric, technical), body in Oxanium (humanist mono-ish, readable).

## Tokens (Tailwind v4)

Stored in `apps/web/app/globals.css`. Dark-only — there is no light theme.

```css
@import "tailwindcss";

:root {
  /* surfaces */
  --background:   0 0% 0%;            /* #000 pure black canvas */
  --surface:      210 30% 5%;         /* #0A0E12 card */
  --surface-2:    210 25% 8%;         /* #11151A elevated card */
  --border:       215 16% 18%;        /* #262C33 thin lines */
  --grid:         215 16% 12%;        /* faint cross overlay (used at 0.6 alpha) */

  /* text */
  --foreground:   210 14% 91%;        /* #E6E8EB primary text */
  --muted:        215 10% 50%;        /* #757B85 metadata text */
  --muted-2:      215 10% 35%;        /* tertiary */

  /* semantic */
  --accent:       187 88% 42%;        /* #0FB8C9 cyan — tabs, primary CTA, "+" */
  --accent-fg:    210 30% 5%;         /* dark text on cyan */
  --success:      142 71% 45%;        /* #22C55E positive money / deltas */
  --destructive:  0 84% 60%;          /* #EF4444 negative money */
  --warning:      38 92% 50%;         /* #F59E0B */

  /* geometry */
  --radius:       2px;                /* sharp corners */
  --hazard:       45deg;              /* hazard stripe angle */
}

@theme inline {
  --color-background: hsl(var(--background));
  --color-foreground: hsl(var(--foreground));
  --color-muted: hsl(var(--muted));
  --color-surface: hsl(var(--surface));
  --color-surface-2: hsl(var(--surface-2));
  --color-border: hsl(var(--border));
  --color-accent: hsl(var(--accent));
  --color-accent-fg: hsl(var(--accent-fg));
  --color-success: hsl(var(--success));
  --color-destructive: hsl(var(--destructive));
  --color-warning: hsl(var(--warning));
  --font-display: var(--font-orbitron);
  --font-body: var(--font-oxanium);
  --radius: var(--radius);
}

html, body { background: hsl(var(--background)); color: hsl(var(--foreground)); font-family: var(--font-body); }
.tabular { font-variant-numeric: tabular-nums; letter-spacing: 0.02em; }
```

## Fonts

Load via `next/font/google` in `app/layout.tsx`:

```tsx
import { Orbitron, Oxanium } from 'next/font/google';

const orbitron = Orbitron({ subsets: ['latin'], variable: '--font-orbitron', weight: ['300', '400', '500', '700'] });
const oxanium  = Oxanium({  subsets: ['latin'], variable: '--font-oxanium',  weight: ['300', '400', '500', '600'] });

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${orbitron.variable} ${oxanium.variable}`}>
      <body>{children}</body>
    </html>
  );
}
```

## Type scale

| Slot | Font | Size / Weight | Tracking |
|---|---|---|---|
| Hero numeric | Orbitron 300 | 64–72px | -0.02em |
| Display | Orbitron 400 | 32–48px | 0 |
| Section header | Oxanium 500 (uppercase) | 14px | 0.18em |
| Body | Oxanium 400 | 16px | 0 |
| Body sm | Oxanium 400 | 14px | 0 |
| Caption / meta | Oxanium 400 | 12px (uppercase) | 0.12em |

Apply `tabular-nums` (`class="tabular"`) to **every** numeric — money, percent deltas, dates, counters.

## Geometry

- Radius: 2px max. Hero/login form fields and buttons use 0–2px.
- Borders: 1px, `border-border` (the muted gray).
- No box shadows — depth comes from surface-2 vs surface, not blur.
- Spacing scale: stick to Tailwind 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64.

## HUD components (in `components/hud/`)

The closed set. Add new ones only when a ticket explicitly needs them.

| Component | Props | Purpose |
|---|---|---|
| `<GridOverlay />` | `cell?: number` (default 32) | Absolute-positioned faint cross-grid SVG. Place at the top of any full-screen view (`login`, `cashflow`). Wraps `<svg>` with `pointer-events: none`. |
| `<HazardStripe />` | `height?: number` (default 18) | Diagonal black-on-near-black stripe divider used between hero section and lists. `repeating-linear-gradient(45deg, #1a1a1a 0 12px, transparent 12px 24px)`. |
| `<NumericDisplay />` | `value: number \| string`, `variant: 'hero' \| 'display' \| 'inline'`, `delta?: { value: number; positive: boolean }` | Orbitron + tabular, optional cyan/red delta badge. Hero = login P125,999,597. |
| `<Money />` | `amountMinor: number`, `currency: Currency`, `variant?` | The ONE place money becomes a string. Uses `formatMoney`. Auto-colors negative red, positive green (variant `neutral` opts out). |
| `<TabBar />` | `tabs: { label: string; href: string }[]`, `active: string` | Cyan underline on active tab; muted text on inactive. Cashflow / Report. |
| `<WarningCounter />` | `count: number`, `label?: string` | Large Orbitron 02-style numeral with caption. Login screen. |
| `<TransactionRow />` | `tx: TransactionDisplay` | Item title (foreground) / date + category (muted uppercase) / amount right-aligned, colored. |
| `<HudButton />` | shadcn Button variant `accent` (cyan), `ghost`, `destructive` | Sharp corners, uppercase label, Orbitron 500. |
| `<HudInput />` | shadcn Input restyled | Transparent fill, 1px border, uppercase placeholder, no rounded corners. |

`<Money />`, `<NumericDisplay />`, and `<WarningCounter />` all share Orbitron + `tabular-nums`.

## shadcn extension pattern

We use shadcn primitives but restyle them through our tokens — we do **not** install custom shadcn presets and we do not maintain a fork.

1. `pnpm dlx shadcn@latest add button input card tabs dialog form label` to install primitives into `components/ui/`.
2. Open each new primitive and replace any `rounded-md` → `rounded-[var(--radius)]`, any `bg-primary` → `bg-accent`, any default font → inherit from `--font-body`.
3. Add a new variant when needed (e.g. `accent` on Button) by editing the cva config.
4. **Never** copy logic from `components/ui/` into `components/hud/` — `components/hud/` *composes* `components/ui/`.

Example:

```tsx
// components/hud/HudButton.tsx
import { Button, type ButtonProps } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function HudButton({ className, ...props }: ButtonProps) {
  return (
    <Button
      {...props}
      className={cn(
        'rounded-[var(--radius)] font-display uppercase tracking-[0.12em] font-medium',
        className,
      )}
    />
  );
}
```

## Color contract

| Element | Color |
|---|---|
| Page background | `bg-background` (pure black) |
| Card | `bg-surface` |
| Elevated card | `bg-surface-2` |
| Primary text | `text-foreground` |
| Metadata, captions, inactive tabs | `text-muted` |
| Primary CTA, active tab underline, links, "+" buttons | `bg-accent text-accent-fg` (button) or `text-accent` (text) |
| Positive money / positive delta | `text-success` |
| Negative money / negative delta | `text-destructive` |
| Hazard stripe | `bg-[#1a1a1a]` on `bg-background` |
| Form field border | `border-border` (1px) |
| Form field background | `bg-transparent` |

**Never introduce a new color** without updating the token table here. Reviewer checks: any hex code in `apps/web/` outside `globals.css` is a defect.

## Layout patterns

### App shell (`app/(app)/layout.tsx`)

```
┌─────────────────────────────────────┐
│ ☰              <Page Title>         │   header: hamburger left, title center
├─────────────────────────────────────┤
│ <TabBar />                          │   (if the page has tabs)
├─────────────────────────────────────┤
│                                     │
│   <page content>                    │
│                                     │
└─────────────────────────────────────┘
```

- Header is 56px tall, sticky.
- Hamburger opens a slide-in nav drawer (Sheet from shadcn).
- Page Title is Oxanium 500 16px, centered.

### Login (`app/(auth)/login/page.tsx`)

- Centered "HUD" wordmark (Orbitron 300, 72px, letterSpacing 0.08em)
- Subtitle: "Authorized personnel only" — Oxanium 400 14px, muted
- Form: USER input, KEY input, ACCESS button — all sharp, uppercase labels, full-width
- `<WarningCounter count={user.failedAttempts} />` bottom-left at 64px from edges
- `<HazardStripe />` at the very bottom of the viewport (full-width)
- `<GridOverlay />` behind everything

### Cashflow (`app/(app)/finance/cashflow/page.tsx`)

Layout per `26060502` blueprint and Figma `node-id=309-631`:

1. Hero `<NumericDisplay variant="hero" />` with `<Money>` + delta badge (Net Income +20% INC)
2. Two-column grid: Gross / Expense sub-cards, each `<NumericDisplay variant="display" />` + delta
3. `<HazardStripe />`
4. Section header `<h2 className="font-body uppercase tracking-[0.18em] text-muted">TRANSACTIONS</h2>` with `<HudButton variant="accent" size="sm">+</HudButton>` right-aligned
5. List of `<TransactionRow />`

## Forbidden patterns

```tsx
// ❌ Inline hex
<div className="bg-[#0fb8c9]">              // use bg-accent

// ❌ Rounded corners > radius
<Card className="rounded-lg">                // use rounded-[var(--radius)]

// ❌ Numeric without tabular-nums
<span>P{amount}</span>                        // use <Money /> or className="tabular font-display"

// ❌ Direct currency math in JSX
<span>P{(amount / 100).toFixed(2)}</span>     // ALWAYS use <Money />

// ❌ Emoji in a category label
<span>🛌 Airbnb</span>                        // emoji are stripped at import (see hud-csv-import)

// ❌ Light-mode classes
className="dark:bg-black bg-white"            // no light mode

// ❌ Box shadow
className="shadow-lg"                         // use surface vs surface-2

// ❌ Component logic in ui/ primitives
// ui/* should remain as close to shadcn as possible; HUD logic lives in hud/*
```

## Accessibility (don't trade away for aesthetics)

- All interactive elements have a visible focus ring: `focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background`
- Hamburger button has `aria-label="Open navigation"`
- Tabs use shadcn Tabs (keyboard-accessible)
- Form inputs have visible labels (uppercase) or `aria-label`
- Color is not the only signal for positive/negative money — the sign (`-P280.00`) is present too
- Color contrast: foreground vs background = 14.4:1 (passes WCAG AAA); muted vs background = 5.8:1 (passes AA for normal text)

## When this skill applies

- Any change under `components/`
- Any new page or layout
- Any token/theme/font change
- Any shadcn primitive add

## When to escalate

- New color, new font, new component category → architect approval (update this skill in same PR)
- Adding a light mode → blueprint required
- Breaking the closed component set → discuss the alternative first
