# Hearth design system: native first, plus Hearth's overrides

Owner: grandparent-ux (Hearth's UI/UX designer). Written Oct 19, 2026, from Chase's ask: "can't we go 100% apple UI/UX. guidelines, guardrails, components, fonts, etc. and maybe the same for android ... that should make it intuitive out of the gate without us guessing. AND you would have tons of constraints". Decision and persona check: `docs/product/decisions/2026-10-19-native-design-system.md`.

## The rule

1. **On iPhone, follow Apple's Human Interface Guidelines (HIG)**: https://developer.apple.com/design/human-interface-guidelines
2. **On Android, follow Material Design 3** (https://m3.material.io) and Android's accessibility guidance (https://developer.android.com/guide/topics/ui/accessibility/apps).
3. **The Hearth overrides below win** wherever they are stricter. They exist because the guidelines are written for everyone, and our least savvy relatives (Grandaddy, Memaw and Pawpaw; the great-grandparents) need a few things stricter.
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

## How the app does it (built Oct 19, 2026; Chase picked "All now")

- **Fonts:** no bundled fonts. `fontFamily` is unset on iPhone and Android, so the phone's own font is used; the web uses the system stack (`app/src/ui/theme.ts`).
- **Colors:** `paletteFor(os, dark)` in `theme.ts`. iPhone uses Apple's system colors, with the Increase Contrast variants where the standard ones miss 4.5:1. Android uses a Material 3 scheme generated from systemBlue with Google's material-color-utilities, so both phones read as blue. One override: Apple's accessible green is only 3.8:1 on its tint, so "safe" green is darker (#1C6E31).
- **Tab bar:** the phone's own tab bar (expo-router `NativeTabs`) on iPhone and Android, with SF Symbols and Material Symbols, 17 pt labels, `minimizeBehavior: never` and Android labels always shown (DS-2, DS-5). The web keeps Hearth's own bar in the same style, because the web version of `NativeTabs` puts the tabs at the top of the screen.
- **Buttons:** iPhone filled, gray and plain buttons; Android filled, outlined and text buttons with the ripple. Icons come from `expo-symbols` and always sit beside words (DS-3).
- **Switches:** the phone's own switch, with the word On or Off beside it.
- **Fields and cards:** iPhone grouped-list style; Android outlined field and outlined card.
- **Confirm dialogs:** a custom dialog shaped like the phone's own (14 pt corners on iPhone, 28 dp on Android). This is a custom control on purpose: Android's system dialog uses 14 sp buttons (DS-2), and the system alert doesn't work on the web or in tests.
- **Tests:** `app/src/ui/__tests__/designSystem.test.tsx` checks fonts, the type ramp, every color pair at 4.5:1 on both phones in light and dark, and tab icons and labels.
- **Old look:** saved in `docs/design/versions/` (screenshots of every main screen, before and after).

**Confirm on a phone (milestone 1 UAT):** the native tab bar with 17 pt labels on an iPhone (Liquid Glass) and on Android, and whether gray buttons stand out enough on the light gray background.
