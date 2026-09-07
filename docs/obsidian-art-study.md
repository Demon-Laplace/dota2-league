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
