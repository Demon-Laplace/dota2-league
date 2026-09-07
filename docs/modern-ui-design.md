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
- Kept the original player win-rate click and logo double-click shortcuts. Background mode exposes a clearly labeled return button and synchronizes its pressed state across both entry points.
- Navigation wraps into two rows on phones. Administrative actions remain in their permission-controlled panels.
- Flattened relationship summary groups, network panels and table controls; retained teal/gold relationship semantics without nested gradients or glows. Preserved node positioning on hover and keyboard focus.
- Unified champion and lifetime sponsorship accents with the modern palette.
- Verified both relationship entry points, network data rendering, table switching, background hide/restore and mobile rendering in Edge. Public regression checks reported no page errors or horizontal page overflow.
- No database, scoring, sponsorship or authorization changes. Authenticated editing workflows remain untested.
