# 2026-05 Supabase Database Rebuild

## Scope

This repository now treats the database as a first-class deployable asset:

- all schema changes live in `supabase/migrations/`
- privileged writes are routed through Edge Functions and reviewed SQL RPC boundaries
- front-end code is limited to `SUPABASE_URL` plus the publishable/anon key
- app access is table-driven via `private.auth_identities`, while season-scoped capabilities remain in `private.user_global_roles` and `private.season_staff`

## Core Schemas

### `public`

- `profiles`
- `players`
- `seasons`
- `season_memberships`
- `matches`
- `match_players`
- `score_ledger`
- `item_catalog`
- `v_leaderboard`
- `v_match_detail`
- `v_season_rank_assignments`
- `v_my_admin_scope`

### `private`

- `auth_identities`
- `user_global_roles`
- `season_staff`
- `item_instances`
- `item_usages`
- `audit_logs`

## Deployment

### Database

`main` branch pushes will run `.github/workflows/deploy-db.yml`, which performs:

1. checkout
2. Supabase CLI install
3. `supabase link --project-ref "$SUPABASE_PROJECT_ID"`
4. `supabase db push --linked`

Required GitHub secrets:

- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_DB_PASSWORD`
- `SUPABASE_PROJECT_ID`

### Edge Functions

`main` branch pushes touching `supabase/functions/**` will run `.github/workflows/deploy-functions.yml`.

Function secrets / environment:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

## Manual post-deploy steps

1. Bootstrap the first admin account in Supabase Auth:
   Create one Auth user manually in the dashboard with an internal email such as `user_admin@internal.local`, set a password, and mark the email as confirmed.
2. Insert the matching admin row into `private.auth_identities` with:
   `username`, `auth_email`, `auth_user_id`, `role = 'admin'`, `is_active = true`.
3. After the first admin can log in, use the in-app account management panel to create the remaining admin / scorekeeper accounts.
4. Assign global roles in `private.user_global_roles` when needed.
5. Assign season staff in `private.season_staff`.
6. Add season memberships in `public.season_memberships`.
   Season memberships now reference `public.players`; `join_status = inactive` means the player exists in the roster but is not participating in the season.
7. If needed, set `rule_config.rank_count` per season through the provided RPC or dashboard SQL editor.
8. If you are bootstrapping from scratch, run `supabase db seed` locally or insert initial season data in the dashboard SQL editor.

## Username + Password Auth

- Users log in with `username + password`
- The browser never sees the service-role key
- Edge Functions map `username -> auth_email`, then call Supabase Auth password login
- The returned Supabase session is stored through the official browser client persistence
- RLS, `auth.uid()`, JWT metadata, and existing SQL RPC boundaries remain unchanged

### `private.auth_identities`

- `username`: unique, lowercase, 3-32 chars, `[a-z0-9_]`
- `auth_email`: underlying Supabase Auth identifier
- `auth_user_id`: linked `auth.users.id`
- `role`: `admin` or `scorekeeper`
- `is_active`: soft-disable switch

New accounts should use internal emails generated from the username:

```text
username      -> auth email
zhangsan      -> user_zhangsan@internal.local
score_keeper1 -> user_score_keeper1@internal.local
```

## Quick roster setup

### Create players in the master roster

Fastest option in the Supabase SQL editor:

```sql
insert into public.players (display_name)
values
  ('选手A'),
  ('选手B'),
  ('选手C');
```

Supabase Auth 账号不会自动创建对应的 `public.players` 记录。参赛选手需要单独维护在主名单里，这样账号身份与联赛参与身份保持解耦。

For larger batches, use the Table Editor or CSV import against `public.players` with these columns:

- `display_name`
- `avatar_url` (optional)
- `is_active` (optional, default `true`)

### Add players from the master roster into a season

This pattern adds all active master-roster players into a season as `inactive` first:

```sql
insert into public.season_memberships (season_id, player_id, join_status)
select
  'YOUR_SEASON_ID'::uuid,
  p.id,
  'inactive'
from public.players p
where p.is_active
on conflict (season_id, player_id) do nothing;
```

After that:

- `join_status = inactive`: in the roster but not participating
- assign a real `rank_no`: the player becomes an active season participant

## Security notes

- no shared admin password
- no service-role key in the static front end
- no authorization based on `user_metadata`
- no real admin / scorekeeper usernames or emails committed to the repository or migrations
- RLS enabled on all `public` business tables
- account access is resolved from `private.auth_identities`
- `private` schema remains closed to `anon`; `authenticated` only gets scoped admin access to `private.auth_identities`
