# Component boundaries

This branch introduces a tested domain layer without changing page layout,
database schema, authentication, or season records.

## Ownership

- src/domain/match-records.js: database/legacy match normalization, team mapping.
- src/domain/number-format.js: Chinese number and rank formatting.
- src/domain/streaks.js: latest consecutive results, one sort and one traversal
  producing both win and loss maps. A preceding opposite result closes the
  segment but does not discard it.
- src/domain/leaderboard-analytics.js: teammate, opponent, side and item statistics.
- app.js: existing UI orchestration, network access and mutable page state.

Each domain module exposes one frozen League namespace. Modules receive data
explicitly and cannot read DOM elements, Supabase, local storage or activeSeason.
The HTML loads dependencies in order before app.js; no bundler is required.
Do not move stateful functions into these modules without making dependencies
explicit. MatchRecords is shared by Streaks and Analytics; neither depends on UI.

## Cleanup and performance

Removed the never-implemented MVP placeholder and its unreachable render branch.
Win/loss streaks previously sorted and scanned the same input twice. The combined
calculation does this once and does not mutate caller-owned match arrays.
Other feature controls and styles are retained because hidden administrator and
historical workflows are not evidence of dead code.

## Verification

Run node --test scripts/domain.test.cjs scripts/champions.test.mjs and
node scripts/test-match-power.cjs. Syntax-check app.js and src/domain/*.js.
The domain tests load the actual production modules, not copies extracted from
app.js, and include the five-loss regression.

## Remaining boundaries

app.js still owns legacy dialogs, sponsorship writes and relationship rendering.
This is an incremental refactor, not a complete decomposition of the application.
Future extractions should introduce explicit state/services for those workflows
and exercise authenticated edits before removing their old implementations.
No database migration or new package dependency is needed for this branch.
