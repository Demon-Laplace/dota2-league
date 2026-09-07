# Modern league UI

Review branch: `design/modern-league-ui`. This branch is not a production deployment.

## Direction

Charcoal surfaces, warm gold accents, quiet dividers, and existing Dota artwork.
The header retains the season selector and sponsorship action. A compact toolbar
opens power allocation, participation scoring, past champions and lifetime
sponsorship dialogs using their existing handlers. Their former icon buttons
are moved out of the standings header, avoiding duplicate entry points.
Main columns each use one readable surface; seasons, dates and teams no longer
add additional card shells. Matches use three columns on large screens, two on
medium screens and one on phones. Each match has one subtle outline and a separate
round header so adjacent matches remain distinct. Standings rows use compact
spacing. Existing score colors retain their meaning.

## Implementation

`modern-ui.css` is a separate presentation stylesheet loaded after `style.css`.
It preserves existing element IDs, hidden states, event handlers, permissions,
background brightness control and scoring behavior. The original stylesheet
continues to own functional layouts and state transitions. No dependencies,
external fonts, database migrations or new remote art assets are introduced.

Hover changes color without moving controls. Dialog entry lasts 160 ms. Reduced
motion preferences suppress transitions and smooth scrolling. Keyboard users
have a skip link and visible focus indicators.

## Verification

Headless Edge rendered public league data at 1440 x 1000 and 390 x 844.
Both widths loaded 24 standings rows and 21 match elements with no page errors
or document-wide horizontal overflow. Match-day expansion was exercised.
The power dialog opened on mobile and retained an internally scrollable body.
Screenshots were inspected and date spacing and match header overlap corrected.
The native season selector and seven shared selection control variants use the
same charcoal and warm-gold styling. Selected, hover and disabled states were
checked in isolated visual fixtures. The actual login player selector was opened
and selected without submitting credentials or changing league data.
Authenticated administrator and scorekeeper workflows have not been exercised;
their shared visual styles are updated without altering their handlers.

Do not merge or deploy to main until the visual direction has been reviewed.

## Public navigation and relationship view follow-up

- Added win-rate relationships and background viewing to the four public navigation entries.
- Kept the original player win-rate click shortcut. Removed the legacy logo double-click trigger; background viewing now uses the labeled navigation toggle only.
- Navigation wraps into two rows on phones. Administrative actions remain in their permission-controlled panels.
- Flattened relationship summary groups, network panels and table controls; retained teal/gold relationship semantics without nested gradients or glows. Preserved node positioning on hover and keyboard focus.
- Unified champion and lifetime sponsorship accents with the modern palette.
- Verified both relationship entry points, network data rendering, table switching, background hide/restore and mobile rendering in Edge. Public regression checks reported no page errors or horizontal page overflow.
- No database, scoring, sponsorship or authorization changes. Authenticated editing workflows remain untested.

## Stable background viewing and power group separation

### Season navigation and player submenu

- Moved the existing season picker to the public navigation under Past seasons; the title badge is now display-only.
- Win-rate navigation opens a compact, scrollable player submenu using the existing player directory, with outside-click and Escape dismissal. Relationship data is loaded only after selecting a player.
- Preserved the original leaderboard win-rate entry and season selection semantics (historical leaderboard selection; match history remains in the existing dated sections).
- Edge checks exercised the submenu on desktop/mobile, the original entry, switching to August 2026 and back to the current season, and background geometry. No page errors or horizontal overflow were observed.

- Background mode uses visibility rather than removing layout boxes, preserving header, navigation and document geometry. Hidden controls cannot receive pointer or keyboard input; previously hidden administrative panels remain hidden.
- Desktop and mobile browser checks confirmed identical background-toggle bounds before and after toggling. Reserved scrollbar space prevents width changes.
- Public power groups now have stronger outlines, alternating muted surfaces and a header divider.
- Champion static publication is not implemented in this revision: the existing archive function defaults to main and its raw leaderboard export omits the frontend's additional scoring components. A separate settlement snapshot pipeline must use the complete scoring rules, allow explicit regeneration after corrections, and respect the review branch before production deployment.
