# UI review: Photos screen (Expo Go, SDK 58), Oct 26 2026

Reviewer: ux-reviewer, walking it as LG (least tech-savvy). Sources: Chase's iPhone screenshot (dark) and the web demo of main at 390×844 and 1280×800, dark and light (no console errors, no horizontal scroll). "Inferred" means read from the screenshot, not measured.

**Score: 5/10 before → 6/10 after this PR** (Polish Freeze baseline 2/10). Next biggest gap: the always-open reply box and the "who can read this" line make every card tall.

## Fixed in this PR
| ID | Fix | Why |
|---|---|---|
| UI-26 | "Check for new photos" removed (the app already refreshes on open and return, plus pull-down). "Show by date" → "By date" with the system sort icon, beside Messages in one row. First photo starts a row sooner. | Chase's call (DEC-39); one focal point; platform icons with words under them. |
| UI-27 | Avatar letter skips "The": "The Holroyds" shows H, not T. | Looked like a bug. |

## Checked and left alone
- The blue gear at the top right is Expo Go's own developer button, not Hearth's. It won't be in a store build.
- Reply box on every card: DEC-30 keeps it there on purpose (no extra tap for LG). Revisit only on Chase's word.
- "The family you shared this photo with can read this": grandparent-ux rule says never group names in that line.
- Send looks grey because it is disabled until you type. Correct behaviour.
- "Photos of Our kids": that's the family's own name as typed; rename the family to "Our Kids" if wanted.
- Reaction row: icon-only is DEC-38. Only the chosen one shows a pill; unchosen ones are plain. Fine as is.

## Parked (Polish Freeze)
- Filter Photos by group (Chase, Oct 26).

## Confirm with a real user
- Does LG find new photos without a button (open the app again or pull down)?
