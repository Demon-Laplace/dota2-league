# Item system: compatible editor refactor

## Implemented in this branch

- `src/domain/item-rules.js`: pure legacy-column adapter, effect capability
  registry, normalization, stack lookup and deterministic preview grouping.
  No DOM, session or database dependencies.
- `src/config/item-options.js`: one source for supported targets and icons.
- `src/ui/item-editor.js`: one editor shared by administrator and scorer,
  with explicit effect choices, labeled fields, neutral record-only mode,
  combination controls and live effect examples.
- `app.js`: still owns authorization, catalog loading and persistence,
  selected players, ledger rendering and match submission.

The editor compiles the currently active behavior into the existing
`score_delta_multiplier`, `score_delta_special` and
`config.match_resolution_mode` fields. It also stores a strictly validated
`config.item_settlement_v2` draft containing independent subject, outcome,
threshold and effect fields. That draft is visible as "下赛季暂存" and is not
used by current-season settlement.
Renaming a catalog item does not change its effect; combinations reference IDs.
Existing catalog definitions and historical ledger entries are not rewritten.
The forward migration `20260923120000_atomic_item_catalog_save.sql` adds the
atomic save RPC. It updates no existing catalog, match or score rows.

## What is customizable now

Name, icon, sponsor amount, permitted target choices, this season's initial
inventory, arbitrary finite multiplier (including zero, fractional and negative),
record-only behavior, and explicitly paired combination effects.
The reset operation has an explicit selector instead of requiring knowledge of
the old `@` token. Pair effects replace the two component effects, rather than
being an additional multiplication. Unpaired effects retain existing semantics.

## Important boundaries: not yet a fully declarative settlement engine

The authoritative legacy SQL still owns current-season effects, including the
special reset rule. The editor can prepare a different condition for v2, but
changing the staged condition cannot affect the active season.

Legacy personal/team IDs remain compatibility identifiers for historical matches.
Do not delete them simply because the new editor does not create them.

Historical score-ledger rendering still includes effect interpretation and is
not yet fully unified with the preview engine. Server settlement is not replaced
by client calculations.

Catalog saving now updates the definition, one season's initial inventory and
pair rules in one transaction. `updated_at` rejects stale concurrent edits.
The RPC validates the staged v2 rule on the server and rolls back the entire
save if any pair or rule is invalid. It deliberately creates no item-edit log.

## Next database milestone

1. Introduce typed, validated effect primitives: multiply match delta, add an
   independent delta, set a chosen score component, or record usage only.
   Keep target selection, trigger conditions and sponsorship separate.
2. Represent conditions explicitly (outcome, pre-match score threshold), with
   validated parameters. Do not allow arbitrary JavaScript/SQL expressions.
3. Snapshot versioned rules on each usage. Existing usages retain their original
   meaning; changing a catalog definition must not silently recalculate history.
4. Have preview and SQL settlement share a conformance test matrix, including
   combinations, cancellations, sponsorship exemptions, losses and undo.

This requires new forward SQL migrations and local database-chain validation.
Do not advertise arbitrary reset values or new triggers until backend validation,
settlement, history snapshots and reversal are all implemented together.

## Verification

## Agreed rollout policy (2026-09-22)

- Earliest candidate is the 2026-10 season. A date change or switching the
  frontend branch alone must not enable v2: the active season must explicitly
  select the new settlement contract, enforced by the server.
- Do not migrate current scores, replay closed seasons, or clean up legacy
  SQL in the initial rollout. Keep legacy routes until the new season has been
  verified in use.
- Item edits are season-scoped. No item-edit history UI or persistent sequence
  of catalog revisions is required.
- Preserve actual per-match score changes for in-season correction and undo.
  Closed seasons keep confirmed final results, match history and sponsorship.
  Normal item edits must never change closed-season results.
- Existing exceptional historical-repair functionality must not accidentally
  bypass this protection; retain it separately until its new behavior is tested.

### Implemented, but not activated

`src/domain/item-settlement-v2.js` is a standalone, strict calculation contract.
Conditions select actor/target, win/loss/any, and an optional pre-match score
threshold; effects independently select match multiplier, flat points, total
assignment or record-only. Numeric precision and half-away-from-zero rounding
are explicit. It is loaded for editor validation, but no match path calls it to
settle a score.

`scripts/item-settlement-v2.test.cjs` covers conditions, loss behavior,
reset thresholds, rounding, invalid payloads and explicit future-season gating.
This is not a deployed backend or a complete multi-item settlement pipeline.

### Required before activation

The full migration chain and atomic RPC were tested in a temporary local
PostgreSQL-compatible environment, including stale-write rejection, invalid-v2
rejection and transaction rollback. No production Supabase migration was run.

Before activation, implement and test server-derived context, authoritative
settlement persistence, inventory/sponsorship integration, combinations, undo
and closed-season protection.
The browser must never be the authority for score context or season eligibility.
Neither an online migration nor production activation has been performed.

## Test commands

- `node --test scripts/item-rules.test.cjs scripts/domain.test.cjs scripts/champions.test.mjs`
- `node scripts/test-match-power.cjs`
- `node scripts/item-editor-preview.cjs`: isolated browser fixture, no database
  calls. Save prints both the legacy payload and staged v2 rule. It is not an authenticated
  end-to-end persistence test.
- Browser fixture checked explicit reset and record-only payloads.
  Screenshot capture timed out, so full desktop/mobile visual QA is pending.
