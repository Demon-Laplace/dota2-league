# Obsidian and copper art study

This opt-in design-branch iteration layers `obsidian-ui.css` after the existing
modern layout. It keeps the compact standings, match grid and interactions.
Neutral shading preserves each background image's own palette; copper marks
actions and old gold marks honors. A small local SVG supplies static surface
grain. No new libraries, remote artwork or continuously running effects are used.

Selecting an ended historical season immediately resolves its champion from the
published champion snapshot and uses the existing player-to-background mapping.
Returning to the current season restores the background from before the history
visit. Missing mappings use that same original background. Automatic background
refresh respects the historical view; viewing history never writes shared
preferences. Explicitly saving background settings exits this temporary override.

No database changes or migrations are required. This iteration is limited to
`design/modern-league-ui`; it does not alter the production main branch.

Verification: JavaScript syntax and whitespace checks; browser checks across
four available historical seasons, automatic-refresh protection and restoration;
real season navigation; desktop/mobile overflow, player picker, power dialog,
champion dialog and background-view layout stability. Browser screenshots are
kept in the task's output directory rather than shipped with the website.

## Edition II

Engraved Chinese display typography, editorial rank numerals, copper hairlines,
matte match headers and warmer neutral auxiliary surfaces deepen the art direction.
Sponsorship categories now use flat ledger rows instead of blue nested pills;
gold totals and muted green paid markers preserve the financial distinctions.

The initial-load power issue came from deferred `loadSeasonPlayers` populating
the power cache without repainting match totals, plus `Number(null)` being
accepted as zero before reaching snapshot fallback. Missing totals now show an
em dash, valid zero stays zero, and membership completion updates only the two
power badges without replacing cards. No scoring or database writes change.

Run `node scripts/test-match-power.cjs` for ten isolated regressions. Browser
verification also delays memberships on a fresh context to check that the
visible totals recover without reload, and checks warm-cache reload separately.

On narrow screens the background-appreciation action is omitted from navigation,
leaving a balanced two-row grid. The two menu arrows are separate, fixed-size
decorations so they no longer shift their labels off the shared center line.
The home and loading marks now place the transparent Dota 2 artwork directly on
the page without a frame, fill or clipped metal backing.

The normal season selector also exposes `2026-04` and `2026-03` as historical
seasons backed by the published champions (Haishen and Su Shen). Since neither
season exists in the database, choosing one follows the existing season and
champion-background path but does not issue an empty leaderboard query. The
standings and match-record surfaces become invisible, like background view,
until the visitor selects a database-backed season again.

The teammate and opponent relationship networks use five labels per vertical
lane. Each upper and lower zone can show up to 20 players on landscape layouts,
and up to five in portrait. The chart is 535 pixels high on landscape and 500
pixels in portrait. Its outer nodes move closer to the panel edges and the five
row centers are slightly tighter, while remaining clear of the center subject.
At 1420 pixels and wider the two networks stay side by side, avoiding unnecessary
dialog scrolling on common 1440-pixel desktop screens.
