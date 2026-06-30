# AGENTS.md

## Purpose of This Directory

This directory is responsible for the Supabase-backed data layer of the project.

The goal of the current refactor is **not** to keep patching the old schema.
The goal is to define and implement a **clean new database structure** that better reflects the business domain.

The new schema should be:

- normalized where appropriate
- clearly named
- easy to reason about
- easy to extend
- safe under permissions
- compatible with multi-season growth
- resilient to future feature additions

---

## Primary Architectural Goal

The key architectural change in this refactor is to **decouple league business entities from authentication entities**.

In particular:

- a league **player** is a business entity
- an authenticated **user/profile** is an identity entity
- those two concepts must not be treated as the same thing by default

This means the schema should no longer assume that:

- every auth user is a player
- every player must be an auth user
- player records should be directly modeled as auth records

That coupling must be removed.

---

## Data Modeling Philosophy

The schema should be designed around **business entities**, not around frontend page shapes.

The schema should reflect the actual league domain:

- players
- seasons
- season membership
- matches
- match participation
- score results
- manual score adjustments
- optional item/rule systems
- permissions
- audit trails

Do not build the schema around UI forms or temporary frontend convenience.

---

## Recommended Core Domain Structure

### 1. `players`
Represents a league participant as a business entity.

Suggested fields:

- `id`
- `display_name`
- `normalized_name`
- `is_active`
- `created_at`
- `updated_at`

Guidelines:

- `display_name` is for human-facing display
- `normalized_name` is for uniqueness/search/deduplication
- this table must not depend on Supabase Auth
- players should remain valid business records even if they never log in

---

### 2. `profiles`
Represents an authenticated identity linked to `auth.users`.

Suggested fields:

- `id` (same as `auth.users.id`)
- `email`
- `display_name`
- `created_at`
- `updated_at`

Guidelines:

- this is identity metadata, not league participation data
- do not overload it with player-season data
- do not use it as the sole source of truth for league participants

---

### 3. `player_accounts` or equivalent mapping table
Represents the relationship between auth identities and league players.

Suggested fields:

- `id`
- `player_id`
- `profile_id`
- `is_primary`
- `created_at`

Guidelines:

- this table should explicitly connect identity and business entity
- keep this mapping flexible rather than collapsing everything into one table
- future needs may include admin-managed players, partial identity binding, or deferred account linking

---

### 4. `seasons`
Represents a competitive season.

Suggested fields:

- `id`
- `code` (for example `2026-05`)
- `name`
- `status` (`planned`, `active`, `closed`, `archived`)
- `start_date`
- `end_date`
- `description`
- `created_at`
- `updated_at`

Guidelines:

- every match and score context should belong to a season
- do not hard-code a single “current season” into the schema
- `code` should be unique and stable

---

### 5. `season_players`
Represents that a player is enrolled in a season.

Suggested fields:

- `id`
- `season_id`
- `player_id`
- `joined_at`
- `initial_score` or `seed_score`
- `is_active`
- `notes`
- `created_at`
- `updated_at`

Suggested constraint:

- `unique(season_id, player_id)`

Guidelines:

- player identity is global
- season participation is season-scoped
- season-specific state belongs here, not in `players`

---

### 6. `matches`
Represents a single recorded match.

Suggested fields:

- `id`
- `season_id`
- `match_time`
- `status` (`draft`, `confirmed`, `cancelled`)
- `source` (`manual`, `import`, `api`)
- `recorded_by`
- `verified_by`
- `notes`
- `created_at`
- `updated_at`

Guidelines:

- a match is a first-class entity
- do not encode all participants into columns like `player1 ... player10`
- match-level metadata should live here, not inside participation rows

---

### 7. `match_players`
Represents one player's participation in one match.

Suggested fields:

- `id`
- `match_id`
- `player_id`
- `team`
- `is_winner`
- `base_score_delta`
- `final_score_delta`
- `attendance_counted`
- `created_at`

Suggested constraint:

- `unique(match_id, player_id)`

Guidelines:

- match participation is a many-to-many relationship and must be modeled as such
- score outcome should be traceable per player per match
- preserve result snapshots where needed so historical data remains stable even if scoring formulas evolve later

---

### 8. `manual_score_adjustments`
Represents manual score additions or deductions outside normal match processing.

Suggested fields:

- `id`
- `season_id`
- `player_id`
- `amount`
- `reason`
- `created_by`
- `approved_by` (optional)
- `created_at`

Guidelines:

- manual adjustments must be separate from match-based scoring
- every adjustment must be auditable
- do not hide manual changes inside generic score totals

---

## Optional Rule and Item System

If the project continues to support item mechanics, temporary effects, or special rule modifiers, use a layered design rather than one overloaded table.

### 9. `items`
Defines item types or rule tokens.

Suggested fields:

- `id`
- `code`
- `name`
- `description`
- `effect_type`
- `is_active`

### 10. `season_items`
Defines which items/rules are enabled for a specific season.

Suggested fields:

- `id`
- `season_id`
- `item_id`
- `config_json`
- `is_enabled`

### 11. `match_item_usages`
Represents actual item usage in a match.

Suggested fields:

- `id`
- `match_id`
- `item_id`
- `target_player_id` (optional)
- `target_team` (optional)
- `used_by`
- `effect_snapshot_json`
- `created_at`

Guidelines:

- separate definition, activation, and usage
- use JSON only for flexible per-instance snapshots or config payloads
- do not stuff the entire rule system into one ambiguous JSON column

---

## Roles, Access, and Whitelisting

Permissions should be modeled explicitly and separately from business entities.

Recommended structure:

### 12. `app_roles`
Suggested fields:

- `id`
- `code` (`admin`, `scorer`, `viewer`)
- `name`

### 13. `user_role_assignments`
Suggested fields:

- `id`
- `profile_id`
- `role_id`
- `created_at`

### 14. `email_whitelist`
Suggested fields:

- `id`
- `email`
- `role_code`
- `is_active`
- `notes`
- `created_at`

Guidelines:

- whitelist controls admission
- role assignment controls authorization
- permission logic should not be scattered across frontend code
- hidden entry points or shared passcodes are not the long-term authorization model

---

## Auditability

### 15. `audit_logs`
Use an audit table for critical actions.

Suggested fields:

- `id`
- `actor_profile_id`
- `action_type`
- `entity_type`
- `entity_id`
- `payload_json`
- `created_at`

Recommended audit targets include:

- match creation and confirmation
- manual score adjustments
- season membership changes
- role changes
- whitelist changes
- item/rule application
- administrative edits

---

## Design Rules

### Rule 1: Separate identity from participation
Auth identity and league participation are different concepts.

### Rule 2: Separate global entities from season-scoped entities
Use global tables for persistent entities and season-scoped tables for seasonal state.

### Rule 3: Use relational modeling for match participation
Matches and players are many-to-many.
Do not denormalize participant lists into fixed columns.

### Rule 4: Preserve historical meaning
Do not design score history in a way that becomes unstable when formulas later change.

### Rule 5: Make manual interventions visible
Any human override or manual adjustment should be explicitly recorded.

### Rule 6: Keep permissions explicit
Authorization belongs in a structured role model, not in ad hoc UI conditions.

### Rule 7: Use JSON selectively
Use JSON only when flexibility or snapshotting genuinely requires it.

---

## Compatibility Expectations

The old frontend may still rely on older assumptions.
If compatibility is needed, prefer:

- compatibility views
- field aliases
- read-focused views for legacy pages
- RPC functions
- adapter query layers

Do not assume the frontend should be rewritten just because the schema becomes cleaner.

---

## Things You Must Not Do in This Phase

Do not use schema work as an excuse to:

- redesign pages
- refactor the user journey
- change visible workflows
- rename user-facing concepts casually
- restructure route architecture
- change how scorers/admins perform routine actions

The current goal is backend correctness and clarity.

---

## End State Definition

The new database structure should satisfy the following conditions:

- player records are independent business entities
- auth identities are modeled separately
- the relation between players and identities is explicit
- seasons are first-class
- season participation is first-class
- matches are first-class
- participation is represented relationally
- manual score changes are auditable
- rule/item extensions are supported cleanly
- roles and permissions are explicit
- auditability is built in
- future features can be added without degrading the schema again

If a design decision improves clarity, integrity, and extensibility without forcing frontend redesign, it is probably aligned with the current goal.