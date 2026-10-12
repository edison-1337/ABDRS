---
name: frontend-design
description: ABDRS UI design system contract for public/browser assets only. Applies before creating or reshaping pages/components under public/.
metadata:
  short-description: Civic, accessible, vanilla-HTML/CSS/JS design contract
---

# Frontend Design (ABDRS)

This skill is a **project-specific design contract** for the Barangay Document Request System. It guides UI decisions for `public/` only; it never modifies `src/`, database, SMS, or backend code, and it never overrides security/auth invariants.

## Precedence

- Read and obey `.agents/skills/00-abdrs/SKILL.md` and `AGENTS.md` first. This skill is **subordinate to `00-abdrs`**.
- If any rule conflicts with this skill, `00-abdrs` and `AGENTS.md` win.
- Security invariants (no secrets in `public/`, no bundler/framework, no Tailwind, parameterized SQL, etc.) are non-negotiable.

## When to use this skill

Load/use this skill before:
- Creating a new page under `public/js/pages/` or a new route-linked view
- Adding or reshaping a component under `public/js/components/` or `public/css/components/`
- Introducing or changing CSS tokens/layouts in `public/css/base/`, `public/css/layouts/`
- Making accessibility/mobile decisions that affect `public/`

## What this skill provides

The single source of truth for visual decisions is **`DESIGN.md`** in this directory. It defines:
- Semantic design tokens (CSS custom properties) intended for `public/css/base/`
- Component inventory mapped to existing folders
- Layout shells for public/auth and staff
- Accessibility, responsive, and content/copy rules
- "Do's & Don'ts" that enforce ABDRS constraints

## Constraints (inherited)

- Plain HTML5, CSS3, vanilla JavaScript ES modules. **No framework, no bundler, no build step** for browser assets.
- No secrets under `public/`. Never inline tokens that are server-only.
- Real copy only; **do not use placeholder claims** in product copy.
- Status must never be signalled by color alone (text + badge).
- Motion must respect `prefers-reduced-motion`.
- Reuse existing components before adding primitives; keep changes consistent with surrounding code.
- Preserve accessible controls, labels, keyboard behavior, loading/empty/error states.

## Commit approval

Never commit before asking first. Staging or committing any file — including this skill's `.md` files and any asset under `public/` — requires explicit developer approval for that exact commit, and approval for one commit never authorizes the next.

Before proposing a commit, report the current branch, the exact files, and the verification results (`npm run lint`, `npm test`), then ask and wait. If approval is not given, leave the changes uncommitted. This inherits the policy in `.agents/skills/00-abdrs/SKILL.md` and `AGENTS.md`; those remain authoritative.

## Notes

- `public/css/base/` currently contains only `.gitkeep`; until Phase 4/5 CSS lands, `DESIGN.md` is the provisional source of truth and **must stay in sync** with any CSS that implements it.
- Do not vendor third-party design libraries, design-system collections, or Python tooling into this repo to satisfy UI work.
- This is a doc/contract skill only; it produces no runtime or build artifacts.