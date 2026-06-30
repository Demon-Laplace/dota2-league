# Migration Rules

This folder contains schema migrations for the league system.

## Critical Domain Semantics

### profiles / users
- represent authenticated website operators
- used for admin / scorekeeper access
- not every league participant has a profile

### players
- represent league participants
- used in matches, standings, scoring, and season membership
- may optionally link to a profile, but this is not required

### season_memberships
- must represent player participation in a season
- should reference `players.id`
- should not require a website account

## Required Modeling

Use:
- `profile` / `user` for authentication, permission, audit operator identity
- `player` for league participation, score calculation, standings, match history

Do not confuse operator identity with participant identity.

## Specific Expectations

Preferred relationships:
- `profiles.id` -> auth user identity
- `players.id` -> league participant identity
- optional: `players.profile_id nullable references profiles(id)`
- `season_memberships.player_id references players(id)`

## When Editing Existing SQL

Before changing a migration, check:
- whether the referenced foreign key still exists
- whether the object is auth-facing or league-facing
- whether a join is based on player identity or profile identity

## Views and Functions

The following database objects should generally remain player-based:
- leaderboard views
- match result processing
- score ledger aggregation
- season membership logic
- season reset / rollover logic

The following should remain profile-based:
- admin permissions
- scorekeeper permissions
- audit actor identity
- protected staff-only operations

## Safe Refactor Pattern

If a function processes league participants:
- start from `players`
- not from `profiles`

If a function checks permissions:
- start from authenticated profile/user
- not from `players`

## Migration Hygiene

During active solo development:
- keep migration history clean
- prefer editing the latest unapplied migration instead of stacking many tiny corrective migrations

After a migration is already applied remotely:
- prefer a new migration for correction
- avoid rewriting shared history

## Avoid These Mistakes

Do NOT:
- globally replace `player_id` with `user_id`
- assume every participant has an auth account
- tie leaderboard eligibility directly to authenticated profiles
- move business semantics just to satisfy a temporary join

## Desired Outcome

A clean database where:
- auth and permissions are simple
- player and season logic are independent
- current UI and workflows continue working with minimal changes

## Migration file discipline

- Never edit the contents of an existing migration `.sql` file once it has been created, committed, or potentially applied anywhere.
- If the schema needs to change, create a **new** migration `.sql` file with a new timestamped filename instead of modifying an old one.
- Treat existing migration files as immutable history.
- This rule applies to all schema changes, including tables, columns, constraints, indexes, views, functions, triggers, RLS policies, and seed-like structural data that is part of migrations.

## Validation workflow

- You are allowed to use Supabase CLI commands to validate migration work locally.
- Prefer validating changes with commands such as:
  - `supabase db reset`
  - `supabase db push`
  - `supabase migration list`
  - other safe `supabase db` / migration-related verification commands when needed
- Before considering a migration task complete, verify that the migration chain can be applied cleanly.
- Do not rewrite migration history just to make validation pass; fix problems with a new forward migration.

- Do not rename, reorder, or delete existing migration files unless the user explicitly instructs you to perform a migration-history reset.