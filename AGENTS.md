# AGENTS.md

## Project Stage and Current Priority

The project is currently in a **database-first refactor phase**.

The primary objective of this phase is to rebuild the data layer into a structure that is:

- clean
- minimal
- maintainable
- explicit
- extensible
- safe to evolve

At this stage, the top priority is **database structure, schema design, migrations, roles, permissions, and data integrity**.

This is **not** a UI redesign phase.
This is **not** an interaction redesign phase.
This is **not** a visual polish phase.

---

## Core Rule

Unless I explicitly ask for it, **do not change UI design, page structure, routes, or interaction logic**.

This includes, but is not limited to:

- do not redesign page layout
- do not move buttons or controls
- do not rewrite the user flow
- do not change navigation structure
- do not rename visible user-facing concepts without approval
- do not "improve UX" on your own initiative
- do not refactor frontend components unless strictly required for compatibility

Default assumption:

> Frontend behavior should remain stable while the database is being rebuilt.

---

## Allowed Focus During This Phase

You should focus on the following kinds of work:

- redesigning the SQL schema
- cleaning up table relationships
- separating business entities cleanly
- improving naming consistency
- improving constraints and data integrity
- improving indexing
- improving migrations
- improving RLS and authorization boundaries
- creating compatibility views or adapters where appropriate
- removing accidental coupling in the data model
- preparing the schema for future seasonal expansion

You are encouraged to optimize the backend architecture, but **not** to broaden the scope into UI work.

---

## Frontend Freeze Principle

During this phase, the frontend is considered **frozen by default**.

That means:

- keep existing screens working if possible
- keep current interaction paths intact
- avoid interface-level refactors
- avoid changing the mental model for administrators, scorers, and users

If backend changes risk breaking existing frontend reads or writes, first attempt to solve the issue through:

1. SQL views
2. compatibility columns or aliases
3. RPC functions
4. adapter queries
5. backend-side mapping

Only if these are clearly insufficient may you propose frontend changes.

---

## Compatibility Rule

If a schema change causes the old frontend to:

- fail to read data
- read incorrect data
- write malformed data
- lose key workflow functionality

then use the following decision order:

1. first try to preserve compatibility at the database or query layer
2. keep existing frontend expectations intact whenever possible
3. if frontend changes become necessary, **stop and ask for confirmation first**
4. do not silently expand the scope into broader frontend cleanup

In other words:

> Compatibility fixes are allowed. Unapproved UI redesign is not.

---

## Scope Control

Do not treat this as a greenfield product rewrite.
Treat it as an active system being stabilized and cleaned up carefully.

This means:

- stability is more important than novelty
- correctness is more important than elegance
- maintainability is more important than cleverness
- reversibility is more important than aggressive change
- small, well-scoped steps are preferred over sweeping rewrites

If unsure, choose the option that is:

- more conservative
- easier to review
- easier to roll back
- less disruptive to the existing system

---

## How to Think About the Domain

This is a real operational league management system, not a demo app.

Changes should prioritize:

- business correctness
- traceability
- permission safety
- operator usability
- long-term maintainability

Do not optimize for superficial modernity at the expense of predictability.

---

## Change Reporting Requirements

When making significant structural changes, clearly state:

- what was changed
- why it was changed
- which tables or queries are affected
- whether data migration is required
- whether frontend compatibility may be affected
- whether confirmation is needed before continuing further

Be explicit about risk and impact.

---

## Out-of-Scope Changes

The following are considered out of scope unless explicitly requested:

- UI redesign
- visual refresh
- route restructuring
- component architecture cleanup for style reasons
- interaction redesign
- dashboard layout redesign
- leaderboard presentation redesign
- form experience redesign
- changing how scorers/admins access existing workflows

Any frontend/UI/interaction change beyond strict compatibility work should be treated as a scope violation.

---

## Default Working Mode

Default working mode for this repository:

- database-first
- schema-first
- migration-driven
- low-risk
- compatibility-aware
- minimal frontend disturbance

Current milestone philosophy:

> First rebuild the foundation.
> Then stabilize compatibility.
> Only later consider interface improvements.

If there is any ambiguity, preserve behavior and reduce scope.

When uncertain, preserve current product behavior and ask the database layer to adapt first.
Database refactoring should be schema-first, not UI-first.

## Frontend / Copy Refactor Priority

When editing frontend code:
- preserve current UI structure and interaction behavior as much as possible
- avoid broad visual redesign unless explicitly requested
- prefer extracting frequently edited user-facing copy into centralized content/config files
- do not scatter editable copy across multiple components when it can be centralized

## Frontend Visual Style

When the user explicitly requests frontend beautification or visual polish:
- prefer a flat, restrained visual language inspired by Tailwind, shadcn/ui, and Lucide
- implement that style within the existing stack unless the user explicitly asks to install those libraries
- favor spacing, border, radius, muted surface, and icon treatment over enlarging badges, buttons, or data chips
- keep component dimensions and information density close to the existing UI unless the user explicitly asks to resize them
- prefer subtle outline, contrast, and iconography changes over glow-heavy, gradient-heavy, or size-driven styling

## Copy Refactor Rules

When refactoring text:
- separate user-facing copy from business logic where practical
- keep existing meaning, tone, and workflow unchanged unless explicitly requested
- do not mix copy extraction with unrelated UI redesign
- prefer minimal, targeted changes

## Optional Copy Rendering

For optional descriptions, subtitles, or helper text:
- conditionally render the entire container, not only the text node
- avoid leaving empty wrappers with spacing when content is absent
- avoid fixed-height placeholders for optional copy unless explicitly required

## UI / Design Style Guidelines

When improving or extending the frontend, follow these design rules unless explicitly told otherwise:

### Visual style
- Keep the interface clean, calm, and visually consistent.
- Prefer a simple, modern layout with good spacing, alignment, and typography.
- Avoid excessive visual clutter.
- Use fewer boxes/cards/panels. Do not wrap every section in a bordered container.
- Prefer whitespace, hierarchy, alignment, and subtle background contrast over heavy boxed layouts.
- Use rounded corners, soft shadows, and restrained color accents only where they improve clarity.
- Keep the overall look coordinated and understated rather than flashy.

### Recommended UI tooling
Use lightweight, mainstream UI tools when they improve maintainability and appearance:
- **Tailwind CSS** for layout, spacing, typography, and visual consistency
- **shadcn/ui** for clean, reusable interface components
- **Lucide** for simple, consistent icons
- **Motion** for small, restrained animations only when they add polish
- Use **Recharts** only when charts are actually needed
- Prefer existing primitives from the current stack instead of introducing overlapping UI libraries

### Performance constraints
- Treat performance as a first-class requirement.
- Do not add heavy visual effects, unnecessary animations, or large decorative dependencies.
- Avoid overusing blur, glassmorphism, parallax, particle backgrounds, or always-running animated effects.
- Prefer CSS-based polish over JavaScript-heavy effects.
- Keep animations short, subtle, and purposeful.
- Avoid large client-side libraries unless they provide clear value.
- Do not introduce 3D, canvas, or advanced visual background libraries unless explicitly requested.
- Reuse existing components and avoid shipping duplicate UI abstractions.
- Minimize bundle growth and avoid unnecessary rerenders.

### Layout preferences
- Prefer flatter layouts over deeply nested card-in-card structures.
- Use sections, spacing, dividers, and typography to separate content before resorting to extra containers.
- Tables, lists, and forms should be easy to scan and not visually overcrowded.
- Dashboard-style pages should feel open and structured, not boxed-in.

### Interaction style
- Maintain professional, unobtrusive UI feedback.
- Hover, focus, active, dialog, and transition states should be clear but restrained.
- Do not add animation just for decoration.
- Preserve accessibility and readability in all UI refinements.

### Scope control
- Do not redesign the product into a different visual identity unless explicitly asked.
- Do not change business logic just to support cosmetic changes.
- Prioritize small, high-value UI refinements over broad visual rewrites.

## Goal

The goal is to make copy easier to edit through centralized configuration, while keeping the current product behavior stable.

```md
For frontend copy extraction and optional description rendering, also follow:
- `/docs/frontend-copy-skill.md`
- `/src/AGENTS.md`
