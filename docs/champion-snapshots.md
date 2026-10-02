# Durable season champion publication

`assets/season-champions.js` remains the public champion list. Opening the
champions dialog reads this asset without querying Supabase or recalculating
historical scores.

## Season closure

Migration `20261002120000_durable_season_champion_publication.sql` adds an
AFTER status-change trigger to `seasons`. On a transition to `closed`, a season
with matches receives exactly one private delivery record in the same
transaction. Empty seasons receive no champion task. If closure rolls back,
its frozen data, task and outgoing request roll back too.

The record freezes the season metadata and all inputs to the existing champion
calculation: leaderboard, participation rules, unrevoked manual adjustments,
hero rewards and item/rollback ledger. The background worker uses the unchanged
JavaScript ranking rule, including Chinese name tie-breaking. It persists the
champion result before the first GitHub write. Later changes to historical
scores cannot alter the frozen automatic publication result.

The database queues an immediate `pg_net` request to
`process-season-champion-publications`. HTTP starts after transaction commit.
Publication continues independently of the closing browser. The existing
`publish-season-champion` endpoint remains a user-authenticated compatibility
endpoint that requests a safe delivery retry and returns status/the saved
champion; regular calls no longer recalculate or publish independently.

## Delivery and recovery

Only due delivery records are processed. There is no daily season scan,
monthly completion marker or champion job in the repository-size workflow.
The original Beijing 02:00 storage accounting remains unchanged.

A minute-based recovery task consults the small private delivery queue and
makes no HTTP request while it is idle. Pending tasks use exponential backoff
(up to one hour). Processing tasks have a five-minute lease; an interrupted
worker can be reclaimed. Stale workers cannot save or finish a newer lease.
The frozen champion is reused on every retry. Published tasks are never claimed.

The worker publishes only the champion asset to the existing `main` and
`design/modern-league-ui` branches. SHA conflicts are re-read before retrying.
If one branch succeeded, the retry preserves that existing identical champion
and completes the other branch. A conflicting winner is an error, not an
implicit overwrite. Delivery is marked published only after the deployed
GitHub Pages asset contains the same winner and score. Deployment lag is a
retryable delivery failure and never repeats league settlement.

## Authorization and operations

Worker endpoints disable gateway JWT checks and enforce their own auth:
normal callers must have a valid Supabase user session; background requests
must carry a random token generated and stored in a private database table.
The worker proves this token through a service-role-only claim RPC. Neither
anonymous nor authenticated users can read the token, claim jobs, mutate frozen
results or finish deliveries. The pg_net request queue is also private to
protect queued headers. No worker secret is placed in the repository/browser.

The worker reuses the existing Edge Function `GITHUB_REPOSITORY`/`GITHUB_TOKEN`
secrets. Its repository and deployment URL are fixed to this production league.
Only administrators may use the existing explicit `regenerate` correction
option; automatic delivery never requests regeneration. Do not correct a
champion while its original delivery is pending: first resolve that task.

`Verify durable champion publication` is a manual operational workflow. Without
an input it checks the deployed trigger, recovery job and authorization. An
optional **already-published ended season** checks idempotent background
delivery after confirming the winner still matches the existing asset. It does
not close a season or modify any scores. A mismatch stops verification rather
than overwriting history. Inspect `private.season_champion_publications` for
attempt count, state, saved champion and the latest delivery error.

## Validation

Run `node --test scripts/champions.test.mjs scripts/champion-publication.test.mjs`.
The database validation applies the migration chain to an isolated PostgreSQL
compatible fixture with pg_net/pg_cron stubs, then verifies rollback, close
capture, empty seasons, immutable inputs, authorization, exclusive leases,
backoff, crash recovery, stale lease rejection and idle dispatch behavior.
Platform extensions and actual delivery require the deployed operational check.
