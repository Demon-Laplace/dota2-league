# Modern league UI

Review branch: `design/modern-league-ui`. This branch is not a production deployment.

## Direction

Charcoal surfaces, warm gold accents, quiet dividers, and existing Dota artwork.
The header retains the season selector and sponsorship action. Two anchor links
provide direct access to standings and match history, especially on mobile.
Main columns each use one readable surface; seasons, dates and teams no longer
add additional card shells. Match cards use two columns on large screens and one
on narrow screens. Existing score colors retain their meaning.

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
Authenticated administrator and scorekeeper workflows have not been exercised;
their shared visual styles are updated without altering their handlers.

Do not merge or deploy to main until the visual direction has been reviewed.
