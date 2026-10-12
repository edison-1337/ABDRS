# ABDRS Frontend Design System

**Status:** provisional contract (until Phase 4/5 CSS lands). Must stay in sync with `public/css/base/`, `public/css/components/`, `public/css/layouts/`.

---

## 1. Visual Theme & Atmosphere

ABDRS is a **civic, transactional service** for a single barangay: residents request official documents, staff review/act on them, and both parties receive SMS notifications. The UI must feel **trustworthy, calm, and legible** — not promotional, cinematic, or decorative.

### Core principles
- **Clarity over flair.** Prefer plain language, dense useful information, and minimal decoration.
- **Civic utility.** Focus on forms, queues, timelines, and status. Avoid hero carousels, gradients, or large display imagery.
- **Single accent.** Choose one primary accent color and use it consistently for interactive elements and focus.
- **Light-first.** Default to a light background. Avoid glassmorphism, mesh/aurora gradients, or heavy shadows.
- **Accessibility-first.** Keyboard navigable, screen-reader friendly, color-contrast ≥ 4.5:1, and `prefers-reduced-motion` respected.
- **Real content only.** No lorem ipsum-style placeholder claims in product copy.

### Key characteristics
- Clean typographic hierarchy with generous line height for forms
- Restrained elevation; focus ring is the primary affordance
- Status communicated via **text + badge**, never by color alone
- Mobile-first, responsive down to small screens
- Fits vanilla HTML/CSS/ES modules, no framework/bundler

---

## 2. Color Palette & Roles

All tokens are **semantic CSS custom properties** intended for `public/css/base/` (e.g. `:root { --color-bg: ... }`). Do not hardcode hex in many places; prefer tokens.

### Backgrounds & surfaces
| Role | Hex (suggested) | Usage |
|---|---|---|
| `bg` | `#f8f9fa` | Page background |
| `surface` | `#ffffff` | Cards, panels, tables, forms |
| `surface-subtle` | `#f1f3f5` | Secondary panels, muted sections |
| `border` | `#dee2e6` | Dividers, card borders, inputs |

### Text
| Role | Hex (suggested) | Usage |
|---|---|---|
| `text-primary` | `#212529` | Headings, body |
| `text-secondary` | `#495057` | Secondary text, descriptions |
| `text-muted` | `#6c757d` | Captions, metadata |
| `text-on-accent` | `#ffffff` | Text on primary buttons/accents |

### Accent & states
| Role | Hex (suggested) | Usage |
|---|---|---|
| `accent` | `#0d6efd` | Primary interactive, links, focus ring base |
| `accent-hover` | `#0b5ed7` | Hover state |
| `focus` | `#0d6efd` | Visible focus ring color |

### Status semantics (domain)
Map to request lifecycle statuses. **Never rely on color alone** — pair with text label and a status badge component.

| Status | Hex (suggested) | Notes |
|---|---|---|
| `status-submitted` | `#6c757d` | Neutral |
| `status-under-review` | `#0d6efd` | Informational |
| `status-approved` | `#198754` | Positive |
| `status-released` | `#198754` | Terminal positive |
| `status-rejected` | `#dc3545` | Negative (terminal) |
| `status-cancelled` | `#6c757d` | Neutral (terminal) |

### Validation severity
From `src/lib/requests/validation.js` semantics:

| Severity | Hex (suggested) | Usage |
|---|---|---|
| `severity-critical` | `#dc3545` | Blocks transition (error text/icon/border) |
| `severity-warning` | `#fd7e14` | Allowed but needs attention |
| `severity-suggestion` | `#6c757d` | Informational only |

### Focus & accessibility
- `--focus-ring`: `0 0 0 3px rgba(13,110,253,0.25)` (visible, high-contrast enough on light surfaces)
- Respect `prefers-reduced-motion` for any transitions/animations.

### Implementation note
Define these as CSS custom properties in `public/css/base/` and consume them in components/layouts. Status/validation colors must be used **only** for badges/icons/borders that are also labeled with text.

---

## 3. Typography

Use a **single family** with strong system fallbacks; no font CDN required.

### Font stack
```css
font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji";
```

Monospace (reserved for identifiers):
```css
font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
```

Use monospace **only** for machine-readable identifiers, e.g. control number `BRGY-2026-000041`. Do not use it for body/UI labels unless necessary.

### Type scale
Base size 16px. Scale follows a conservative, legible hierarchy.

| Role | Size (px/rem) | Weight | Line height | Usage |
|---|---|---|---|---|
| `text-xs` | 12/0.75 | 400–500 | 1.4 | Captions, metadata |
| `text-sm` | 14/0.875 | 400–500 | 1.5 | Secondary text, help |
| `text-base` | 16/1.0 | 400 | 1.6 | Body text, form inputs |
| `text-md` | 18/1.125 | 400–500 | 1.6 | Lead paragraphs |
| `text-lg` | 20/1.25 | 600 | 1.4 | Card titles, subsection |
| `text-xl` | 24/1.5 | 600 | 1.3 | Section headings |
| `text-2xl` | 28/1.75 | 600 | 1.25 | Page headings |
| `text-3xl` | 32/2.0 | 600 | 1.2 | Major page title (use sparingly) |

- Default body: `text-base`, weight 400, line-height 1.6.
- Headings: `text-lg`–`text-2xl`, weight 600.
- Line length target: < 80 characters for paragraphs.

---

## 4. Components

Components live under `public/css/components/` and `public/js/components/`. **Reuse existing primitives first**; add only when missing. Keep accessible controls, labels, keyboard behavior, loading/empty/error states.

### Button
- Variants: `btn-primary`, `btn-secondary`, `btn-ghost`, `btn-danger` (as needed)
- Padding: `8px 16px` (min height ≥ 44px for touch)
- Border-radius: `4px`
- Focus: visible focus ring
- States: hover, active, disabled, loading

### Field / Input / Select / Textarea
- Label associated (`<label for>`)
- Padding: `8px 12px`; min height 44px on inputs/selects where practical
- Border: `1px solid var(--border)`
- Border-radius: `4px`
- Focus: visible focus ring
- Help text and inline validation messages (use severity text + optional icon)
- File upload: accessible label, accept restrictions as needed

### Card
- Background: `var(--surface)`
- Border: `1px solid var(--border)`
- Border-radius: `4px`
- Padding: `16px` (mobile), `24px` (desktop)
- Subtle elevation: `0 1px 2px rgba(0,0,0,0.02)` max (or none)

### Status badge
- Required for lifecycle/status display. **Text + pill/badge**; color encodes status but label is mandatory.
- Padding: `4px 8px`
- Border-radius: `9999px`
- Font-size: `text-xs`, weight 500
- Map to `status-*` tokens

### Timeline / Stepper
- For request lifecycle visualization (submitted → under_review → approved → released, with terminals)
- Clear step labels, timestamps if present, current/completed/terminal states
- Accessible (list semantics)

### Staff data table
- For queue/detail lists. Columns aligned, sortable if applicable, row actions clearly labeled
- Padding: `8px 12px`
- Zebra or clean rows; hover state
- Mobile: consider horizontal scroll or stacked view with labels
- Empty state, loading state

### Toast / Alert
- For transient feedback and errors
- Use severity mapping (`critical`/error, warning, info/suggestion)
- Dismissible where appropriate; focus management on interactive toasts
- Role: `status` or `alert` as appropriate

### Confirm modal
- Focus trap, ESC to close, explicit confirm/cancel with clear labels
- Backdrop; avoid auto-closing on outside click unless specified
- Centered, max-width constrained

### Empty / Error / Loading states
- Consistent copy (real, no placeholder claims), icon optional
- Loading: non-blocking where possible; avoid layout shift
- Error: actionable guidance, reference correlation/id if logged (never PII)
- Empty: invite action with clear CTA

### Pagination
- Accessible controls (previous/next, page numbers), keyboard operable
- Show current page, total if known

---

## 5. Layout

Two layout shells in `public/css/layouts/`: **public/auth** and **staff**.

### Spacing scale (4/8px base)
| Token | Value | Usage |
|---|---|---|
| `space-1` | 4px | Micro gaps |
| `space-2` | 8px | Tight gaps |
| `space-3` | 12px | Input padding/gaps |
| `space-4` | 16px | Standard gaps, card padding |
| `space-5` | 24px | Section gaps |
| `space-6` | 32px | Major section gaps |
| `space-7` | 48px | Large gaps |
| `space-8` | 64px | Page section spacing |

### Container widths
| Name | Max-width | Usage |
|---|---|---|
| `container-sm` | 640px | Forms, auth, public tracking |
| `container-md` | 768px | Content pages |
| `container-lg` | 1024px | Staff queue/detail layouts |
| `container-xl` | 1280px | Wide staff layouts (tables) |

### Public/Auth shell
- Narrow centered layout (`container-sm`)
- Minimal chrome (brand/title + form/card)
- Focused on forms and public tracking by control number
- Mobile-first, single column

### Staff shell
- Sidebar + main content (`container-lg`/`container-xl` as needed)
- Navigation grouped by role-relevant items
- Queue, request detail, documents/residents/SMS log
- Tables can scroll horizontally on narrow screens

---

## 6. Depth

Keep elevation **restrained**. Avoid heavy shadows, glass, or decorative blur.

- **Level 0:** none (page background)
- **Level 1 (cards/forms):** `0 1px 2px rgba(0,0,0,0.02)` (or `border` only)
- **Level 2 (modals/dropdowns):** `0 4px 6px rgba(0,0,0,0.04), 0 2px 4px rgba(0,0,0,0.03)`
- **Never:** `rgba(0,0,0,0.1)+` large stacks, glassmorphism, backdrop-filter blur for decorative chrome

**Focus ring (mandatory):** `box-shadow: 0 0 0 3px rgba(13,110,253,0.25)` on keyboard focus; ensure it remains visible and high-contrast. Respect `:focus-visible`.

---

## 7. Do's & Don'ts

### Do
- Follow `src/lib` ownership: UI moves data; never duplicate domain rules in `public/js`.
- Use semantic tokens from `public/css/base/`; prefer CSS custom properties.
- Pair status with text + badge; never signal status by color alone.
- Preserve accessible controls, labels, keyboard behavior, loading/empty/error states.
- Reuse existing components before adding primitives.
- Keep copy real, specific, and action-oriented (consistent action names through flows).
- Respect `prefers-reduced-motion` for any motion.
- Ensure ≥ 44px touch targets for interactive controls.
- Meet WCAG AA contrast on text and meaningful UI.
- Use monospace only for control numbers and other identifiers.
- Keep changes consistent with surrounding code/style.

### Don't
- Add framework, bundler, build step, Tailwind, or npm CSS deps.
- Put secrets, env values, or server-only tokens under `public/`.
- Use placeholder claims, lorem ipsum as product copy, or vague errors.
- Echo raw driver/gateway errors to client (only repo-constructed messages).
- Use glassmorphism, aurora/mesh gradients, cinematic hero, or decorative parallax.
- Animate every element (hover/fade/slide) — motion only if it clarifies state/change.
- Introduce numbered markers unless content is actually a sequence.
- Use all-caps for labels, single-word accenting in headlines, or middle-dot meta strings as decoration.
- Rely on color alone for status/severity.
- Add heavy shadows/elevation without reason.

---

## 8. Responsive & Accessibility

### Breakpoints
| Name | Width | Notes |
|---|---|---|
| `sm` | < 640px | Phones |
| `md` | 640–768px | Small tablets |
| `lg` | 768–1024px | Tablets/landscape |
| `xl` | 1024–1280px | Desktop |
| `2xl` | > 1280px | Wide desktop |

Mobile-first: write base styles for small screens, add `min-width` media queries.

### Accessibility checklist
- [ ] All interactive elements are keyboard reachable and operable (Tab/Enter/Space/Esc)
- [ ] Visible `:focus-visible` styles on all focusable controls
- [ ] Labels associated with inputs (`<label for>`); use `aria-label` only when label not visible but meaningful
- [ ] Error messages linked to inputs (`aria-describedby`) and announced
- [ ] Status/alerts use appropriate roles (`status`, `alert`)
- [ ] Color contrast ≥ 4.5:1 for text, ≥ 3:1 for UI components where applicable
- [ ] Status never signalled by color alone (text + badge)
- [ ] Images have `alt` text (decorative: `alt=""`)
- [ ] Forms validate accessibly; required fields indicated
- [ ] Reduced motion respected: `@media (prefers-reduced-motion: reduce) { ... }`
- [ ] Touch targets ≥ 44px for primary actions

### Responsive behaviors
- Staff tables: horizontal scroll on narrow viewports; consider stacked labels on very small screens
- Forms: single column on mobile
- Sidebar: collapse/stacks appropriately on small screens (preserve keyboard access)
- Spacing scales down modestly on mobile (use `space-4/5` vs `space-6/8`)

---

## 9. Agent Prompt Guide

Quick reference for UI work in `public/`.

### Token consumption
```css
/* In public/css/base/ */
:root {
  --color-bg: #f8f9fa;
  --color-surface: #ffffff;
  --color-border: #dee2e6;
  --color-text-primary: #212529;
  --color-accent: #0d6efd;
  /* status/severity as needed */
}
```

### Add a component (checklist)
1. **Reuse first.** Check `public/css/components/` and `public/js/components/` for existing primitive.
2. **Keep thin.** Component only moves data; domain logic stays in `src/lib/`.
3. **Style via tokens.** Use CSS custom properties and existing spacing scale.
4. **Accessibility.** Labels, keyboard, focus ring, loading/empty/error states.
5. **Mobile.** Test small viewport; ensure ≥ 44px targets.
6. **Consistency.** Match surrounding naming/style.

### Status badge example
```html
<span class="status-badge status-badge--approved" aria-label="Status: approved">Approved</span>
```

```css
.status-badge { padding: 4px 8px; border-radius: 9999px; font-size: 0.75rem; font-weight: 500; }
.status-badge--approved { background: rgba(25,135,84,0.12); color: #198754; }
```
*(Color + text label; never color alone.)*

### Reduced motion
```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

### Quick rules
- One accent color. Focus ring visible. Light-first. Civic, calm.
- No framework/bundler/Tailwind. No secrets in `public/`.
- Status = text+badge. Motion respects reduced motion. Real copy only.
- UI moves data; `src/lib` owns decisions.
- Design tokens live in `public/css/base/`; primitives in `public/css/components/`; shells in `public/css/layouts/`.
- Until CSS exists, this DESIGN.md is provisional — **keep in sync** when implementing tokens/components/layouts.
