# Item / Reward Modeling Rules

Item effects must be modeled as explicit business events, not as ad hoc columns on matches or standings tables.

## Required Structure

Use a dedicated item usage table to record:
- which season the usage belongs to
- which item type was used
- who used it (`actor_player_id`)
- who received the effect (`target_player_id`)
- which match it applies to (`match_id`) when relevant
- the applied reward value (`reward_points`) when relevant
- who recorded it in the system (`recorded_by_profile_id`)

## Identity Rules

- actor/target in league logic should reference `players.id`
- system operators should reference `profiles.id`
- do not use authenticated profile identity as a replacement for player identity

## Scoring Rules

Item usage records business intent.
Actual score changes must still be written to `score_ledger`.

Recommended linkage:
- `score_ledger.source_type = 'item_usage'`
- `score_ledger.source_id = item_usages.id`

## Extensibility

The schema must support:
- self-targeted items
- items used on another player
- match-bound items
- season-wide items
- positive or negative reward values
- future non-points item effects via `metadata jsonb`