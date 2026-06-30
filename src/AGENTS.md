# Frontend Copy and Content Rules

## Reference Document

For detailed copy extraction and optional-text rendering guidance, follow:

- `/docs/frontend-copy-skill.md`

When editing frontend copy, content config structure, or optional description rendering behavior, treat that document as the implementation guide.

## Main Rule

Frequently edited copy should be centralized into content/config files instead of being hardcoded directly in pages and components.

Preferred locations:
- `src/content/*`
- `src/config/*`

## What Should Be Extracted

Prefer extracting:
- page titles
- subtitles
- descriptions
- helper text
- admin explanations
- item descriptions
- empty-state messages
- confirmation copy
- AI/user-facing prompts shown in the interface

## What Does Not Need Immediate Extraction

Do not over-engineer by extracting every tiny string immediately.
It is acceptable to leave:
- very small one-off labels
- extremely local static text unlikely to change
- low-value internal-only microcopy

## Rendering Rules for Optional Copy

If a description or helper text is optional:
- do not render spacing wrappers when the content is empty
- use trimmed string checks when content comes from config files
- do not reserve empty visual space for removed copy

Preferred pattern:

    ```tsx
    {description?.trim() && (
    <div className="space-y-1">
        <p className="text-sm text-muted-foreground">{description}</p>
    </div>
    )}

    Avoid:

    <div className="mb-4">
    {description && <p>{description}</p>}
    </div>

    because the wrapper may still leave blank space.

## Layout Discipline

When optional text is removed:

the layout should collapse naturally
no empty row, empty card section, or fixed-height placeholder should remain
spacing should come from rendered elements, not from permanently mounted empty containers
Behavior Safety

Do not change frontend business behavior while extracting copy.
Refactor copy first.
Only adapt component structure where necessary to avoid empty space or hardcoded text.
