# Static season champions

`assets/season-champions.js` is a small public asset loaded before the app. The
champions dialog renders it synchronously: opening the dialog does not query
Supabase, recompute historical scores, or consult the device champion cache.
The existing two legacy entries are retained. Later entries are generated from
ended-season records, never manually assigned to a winner.

## Settlement and publication

After successful season rollover, the client invokes `publish-season-champion`.
The function verifies authentication and `can_adjust_scores(seasonId)`, requires
an ended season, calculates the winner on the server, and publishes only the
static champion asset to `main` and `design/modern-league-ui`. It reuses the
existing `GITHUB_REPOSITORY` and `GITHUB_TOKEN` Edge Function secrets (the token
must have repository contents write access). No schema migration is required.
The existing deploy-functions workflow deploys the new function on push.

The calculation includes ledger points, season-specific participation rules,
unrevoked manual adjustments and hero rewards. Total-score ties use win/loss,
item, participation and manual components, win rate, then the Chinese name sort,
matching the existing total leaderboard. The UI's optional win/loss sort never
affects champion selection. Source reads are paginated and any failure prevents
publication; a missing score component is never silently treated as zero.

Existing snapshots are immutable during normal publication. GitHub SHA checks
and retries prevent overwriting concurrent asset updates. A partial two-branch
publication can be retried without another season rollover. This is a post-
settlement operation: publication failure does not undo or repeat settlement.
The client shows a distinct failure message. Newly published results update the
settling browser immediately; other visitors receive the asset on their next
site load after GitHub Pages has published the commit. There is no polling.

## Retry / explicit correction

An authenticated season manager can retry the existing function invocation with
`{ "seasonId": "<ended-season-uuid>" }`. Only an administrator may request
`{ "seasonId": "<ended-season-uuid>", "regenerate": true }` after correcting
historical records. Clients cannot supply a winner, branch or repository path.

Repository maintainers can also run `node scripts/export-champions.mjs` to add
missing ended seasons using public reads only, then commit the asset to both
branches. It preserves all existing snapshots by default. After an intentional
historical correction use `node scripts/export-champions.mjs --regenerate=2026-06`
with the actual season code. Review the diff before committing. Never hand-edit
the winner to hide a data error. Git history is the publication audit trail.

## Verification

- `node --test scripts/champions.test.mjs` covers independent reward components,
  progressive participation points, item reversals, Unicode serialization and
  rejection of active seasons.
- Initial May–August 2026 generated winners and scores were compared with the
  existing browser total leaderboard; all four matched, including TI4 将军.
- Six champions rendered with Supabase REST blocked in the browser.
- Live season rollover is not executed for testing: it changes league state.
