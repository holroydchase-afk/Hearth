# Hearth design system: native first, plus Hearth's overrides

Owner: grandparent-ux (Hearth's UI/UX designer). Written Oct 19, 2026, from Chase's ask: "can't we go 100% apple UI/UX. guidelines, guardrails, components, fonts, etc. and maybe the same for android ... that should make it intuitive out of the gate without us guessing. AND you would have tons of constraints". Decision and persona check: `docs/product/decisions/2026-10-19-native-design-system.md`.

## The rule

1. **On iPhone, follow Apple's Human Interface Guidelines (HIG)**: https://developer.apple.com/design/human-interface-guidelines
2. **On Android, follow Material Design 3** (https://m3.material.io) and Android's accessibility guidance (https://developer.android.com/guide/topics/ui/accessibility/apps).
3. **The Hearth overrides below win** wherever they are stricter. They exist because the guidelines are written for everyone, and our least savvy relatives (Scott, Susan and John; the great-grandparents) need a few things stricter.
4. **Don't invent.** Before designing a custom control, look for the system one. A custom control needs a written reason in the PR.

Same features, same photo quality and same words on both phones (persona AG). Only the look follows each phone.

## What we take from the platforms

| Area | iPhone (HIG) | Android (Material 3) |
|---|---|---|
| Font | The system font (SF Pro) through the system text styles, so Dynamic Type and Bold Text work | The system font (Roboto or the phone maker's) in `sp`, so the phone's font size and Android's up-to-200% scaling work |
| Text size | Body is 17 pt at the default size; support enlarging to at least 200% without clipping or truncating (HIG Accessibility, Typography) | Same rule: text in `sp`, tested at the largest font size |
| Tap targets | 44×44 pt minimum (HIG) | 48×48 dp minimum (Android accessibility) |
| Contrast | 4.5:1 minimum for text, in light and dark mode; honor Increase Contrast | 4.5:1 for text under 18 sp (14 sp bold) |
| Navigation | Tab bar with a symbol and a text label on every tab (HIG Tab bars) | Navigation bar with labels always shown |
| Icons | SF Symbols | Material Symbols |
| Buttons | System button styles; labels start with a verb ("Add to Cart" is Apple's own example) | Material buttons (filled, tonal, outlined, text) |
| Sheets, alerts, pickers | System sheets, alerts, share sheet, photo picker | Material bottom sheets and dialogs, the system photo picker |
| Dark mode | Supported with system colors | Supported with the Material color scheme |
| Screen readers | VoiceOver labels on every control | TalkBack labels on every control |

The web viewer (for GG and anyone without the app) follows the iPhone column with the system font stack, so it looks familiar on both phones and on a computer.

## Hearth overrides (stricter than the platform)

| # | Override | Platform default it tightens | Why |
|---|---|---|---|
| DS-1 | Tap targets are **48 pt** on both phones, with space between them | HIG allows 44 pt | CLAUDE.md rule 3; older hands and older phones |
| DS-2 | **No text smaller than 17 pt** at the default size, including captions, timestamps and tab labels | HIG and Material use 11–13 pt for captions and tabs | Rule 3; UX-REVIEW found 11–12 pt labels June couldn't read |
| DS-3 | **Every icon has a word** under or beside it. No icon-only buttons, even in toolbars | HIG and Material allow icon-only toolbar buttons | Rule 3; G3 "tap the one that says…" over the phone |
| DS-4 | **Every swipe, long-press or pinch also has a button** that does the same thing | HIG says offer alternatives; Hearth makes it a must | Rule 3: no gesture-only actions |
| DS-5 | **Tab labels never hide**: no tab bar that minimizes on scroll, no labels that show only when selected | iOS lets the tab bar minimize; Material lets labels show only when selected | The way back must always be visible, with its word |
| DS-6 | **Text sits on a solid background.** No text over translucent glass or a photo without a solid backing | iOS translucent materials | Contrast outdoors and on old screens; honors Reduce Transparency |
| DS-7 | **Hearth's words**: group (not circle), Photos (not feed), Help (not Me) | Platform words like "Library" or "Settings" | Rule 3 |
| DS-8 | **Errors and loading use words**: what happened, what to do, who to call; spinners always have a line of text | Platforms allow a bare spinner | G2, GOALS "never empty, never silent" |
| DS-9 | **One main action per screen**, as one filled button | Platforms allow several prominent buttons | "Just show me the babies" (LG) |

## What changes in the app (not built yet)

Today the app uses its own fonts (Figtree and Young Serif in `app/src/ui/theme.ts`), its own tab bar (`app/src/screens/TabBar.tsx`) and its own button kit (`app/src/ui/kit.tsx`). Moving to native is app-engineer work, test-first, screen by screen, after Chase picks the timing (TRACKER). Expected order: system fonts and text styles (smallest change, unlocks Dynamic Type), then the native tab bar, then buttons, sheets and alerts. Component and library versions come from Expo's and the vendors' live pages (rule 8), never from memory.
