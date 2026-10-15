# Hearth prototype: grandparent UX review (Grandma June)

**Reviewed:** `prototype/hearth.html`, Oct 15, 2026, at 360x740 (a 4-year-old Galaxy A-series), default and Larger text.
**Screenshots:** `ux-shots/` (`jo-*` = Grandma Jo as viewer, `chase-*` = Chase as poster, `*-big` = Larger text on).
**How measured:** Playwright `getBoundingClientRect()` and `getComputedStyle()` on every button, input, select and label; WCAG contrast computed from the CSS tokens. 1 CSS px is about 1 dp on her phone, so the 48 pt rule is applied as 48 px.

## Verdict: Blocker (for putting it in front of June). The fixes are small.

The bones are right. A viewer gets only two tabs, sees who sent each photo by name, there's no password, and "Shared with you" is clear. Chase's side is careful about who sees what. But June would not get past day one, for three reasons:

1. **She can't read it.** Default body text is 15 px, timestamps 12 px, tab labels 11 px. Larger text only goes to 19 px, still leaves timestamps at 15 px and tabs at 14 px, and it's hidden at the bottom of "Me". Her Samsung already has text turned up, and the page ignores that because the root font size is fixed in px.
2. **She can't hit it.** Reaction buttons are 30 px tall and 39 px wide, Send is 40 px, viewer Close, Next and Previous are 38 px. Nothing she taps in the feed meets 48.
3. **She can't keep the photo, and the text looks like a scam.** There's no way to save a photo, which is the first thing she'll want. And the text she gets ("Hearth: Chase shared 2 photos. See them: hearth.family/v/8RT1") reads like the fake package-delivery texts she's been warned about. There's also no first-open screen and no "invite too old" screen, so we don't know what she sees when she taps.

Chase's screens are "Needs changes": mostly contrast, tap size, and two layout bugs in the Share sheet.

## Measurements

| Thing | Default | Larger text | Rule | Pass? |
|---|---|---|---|---|
| Body text (caption, names) | 15 px | 19 px | 17+ | Default fails |
| Time ("2h ago"), "Shared with you" | 12 px | 15.2 px | 17+ | Fails both |
| Tab labels (Home, Me) | 11 px | 13.9 px | 17+ | Fails both |
| Sub-text on Me (option descriptions) | 12.5 px | 15.8 px | 17+ | Fails both |
| Viewer bar "1 of 2 · Chase" | 13 px | 16.5 px | 17+ | Fails both |
| Reaction buttons | 39-52 x 30 | 44-60 x 36 | 48x48 | Fails both |
| Comment Send | 69 x 40 | 78 x 46 | 48 | Fails both |
| Viewer Close / Previous / Next | 65-93 x 38 | 74-110 x 44 | 48 | Fails both |
| Radio dot (Me) | 18 x 18 (whole card 282 x 62+ is tappable) | same | 48 | Passes via the card |
| Larger text checkbox | 20 x 20, label not full-width | same | 48 | Fails |
| Chase: Rename / Delete circle / Change | 21 px tall, side by side | 26 px | 48 | Fails |
| Chase: circle pills | 31 px tall | 36 px | 48 | Fails |
| Chase: thumbnail remove × | 24 x 24 | 24 x 24 | 48 | Fails |
| Chase: Share / Cancel / Copy link | 40-42 px tall | 46-48 px | 48 | Fails at default |
| Tabs | 170 x 52 (viewer) | 170 x 56 | 48 | Pass |

| Contrast (light mode) | Ratio | Pass? |
|---|---|---|
| Body ink on white | 15.4 | Pass |
| Muted grey on white / on page | 5.7 / 5.2 | Pass, but thin outdoors at 12 px |
| Green banner and "on" pills | 4.7 | Barely pass, weak in sunlight |
| **Orange link text (Change, Rename, Delete circle)** | **2.3** | **Fail** |
| Disabled "Previous" in viewer | 2.3 | Looks broken to June |
| Dark mode: muted / orange link | 6.5 / 8.7 | Pass |

## Changes

### What June sees (viewer role)

| # | Screen | Problem | What June would do | Fix (exact wording) |
|---|---|---|---|---|
| 1 | Text message she gets (Me preview) | "Hearth: Chase shared 2 photos. See them: hearth.family/v/8RT1". Brand first, short code link: looks like a scam text. | Delete it, or call Chase to ask if it's real. Most likely ignore it. | "From Chase on Hearth: 2 new photos of Mia. Tap to see them: hearth.family/v/8RT1" Always start with "From [name] on Hearth:". Name the grandkid when the caption allows. Never put a code, a dollar sign or "verify" in it. |
| 2 | Daily/weekly email | "Your daily Hearth digest: 3 posts from your family. Open: …" "Digest" and "posts" are foreign words. A generic sender looks like spam. | Leave it unread in AOL for a week. | Sender name always "Chase on Hearth". Subject: "3 new photos of Mia and Leo from Chase". Button: "See the photos". |
| 3 | Every viewer screen | Body 15 px, times 12 px, tabs 11 px. The page ignores her phone's text size. | Squint, hold the phone at arm's length, give up and wait for Facebook. | Viewers start with Larger text **on**. Raise the Larger text floor so nothing is under 17 px, including times, tabs and sub-text. Size text off her phone's setting (rem from the browser default, `sp`/Dynamic Type in the app), not a fixed 15 px root. |
| 4 | Full-screen viewer | No way to save the photo. | Screenshot it with the wrong buttons and lock the phone, or call Chase. | Add a big button under the photo: **"Save to my phone"**. After saving, show "Saved to your Gallery". |
| 5 | Full-screen viewer | Top bar shows only "1 of 2 · Chase" at 13 px. No caption, no date. Previous shows greyed out on the first photo. | Not sure who's in it or when. Taps grey "Previous" and thinks it's broken. | Bar: "From Chase · Sun, Oct 11". Caption under the photo at body size. Hide Previous on the first photo and Next on the last. Rename the buttons "◀ Back" and "Next ▶", 48 px tall. |
| 6 | Feed | Reactions are emoji-only buttons, 30 px tall, packed 6 px apart. | Taps the wrong one, then can't undo it, then feels foolish. | Two buttons, 48 px tall, 12 px apart, with words: "❤️ Love it" and "😂 Funny". Drop 😮. Show her own choice as "You loved this". |
| 7 | Feed | No heading. "Hearth" plus a small subtitle doesn't tell her what this is. | Wonders whether she's on the right page. | Heading at the top of the feed: **"Photos of Mia and Leo"**. Under it: "Sent by Chase and Alex". |
| 8 | Feed | Comment box: "Add a comment" / Send 40 px. "Comment" is a Facebook word she half knows. | Probably fine, but misses the Send button. | Placeholder: "Write something back to Chase". Button: "Send", 48 px tall. After sending: "Sent. Chase will see it." |
| 9 | Feed (video) | A real video in the feed isn't tappable to go full screen. It plays tiny and muted. | Thinks the video is broken because there's no sound. | Make videos open in the full-screen viewer like photos. Start with sound on and a big "▶ Play" button. |
| 10 | Feed, slow network | Nothing shows while photos load. The prototype has no loading state at all. | Thinks it's broken and taps the link again. | While loading, show the words "Loading the photos…" with a spinner. Show a small blurry preview first, then sharpen. |
| 11 | Me tab | Named "Me". Order is: how we tell you, Larger text (below the fold), then privacy. No help. | Never finds the text size. Doesn't know who to call. | Rename the tab for viewers to **"Help"**. Order: (1) "Need help? Call Chase" with a big call button, (2) "Bigger text" (on by default), (3) "How should we tell you about new photos?", (4) "Keeping your photos private". |
| 12 | Me tab, notification choices | "App notification", "Instant", "Daily email digest", "Weekly… roundup". | Picks nothing, or picks wrong and never hears about photos again. | "A text message: one text each time there are new photos (Recommended)", "An email every evening with the day's new photos", "An email every Sunday morning", "A sound on your phone (only if Chase set up the app for you)". Toast: "Saved. We'll text you when there are new photos." |
| 13 | Me tab, privacy card | "servers", "encrypted with keys Hearth controls", "train AI", "Location data", "upload", "account". | Skips it. Or worse, reads "AI" and "location" and gets worried. | "Your photos stay in the United States." / "No one outside the family can see them. No ads, no strangers." / "No computer program learns from your photos." / "Photos don't show where they were taken." / "Chase can delete everything at any time." |
| 14 | Me tab, role line | "Can view, react and comment." | Doesn't know what "react" means. | "You can look at photos and write back." |
| 15 | Me tab, Larger text | 20 px checkbox; only the text beside it is tappable. | Misses the box. | Make the whole card one 48 px+ switch: "Bigger text: On / Off". |
| 16 | First open from the invite (missing) | No screen exists for the moment she taps Chase's invite. | Unknown. That's the problem. | Screen: "Chase invited you to see the family photos." One button: **"See the photos"**. Small line: "No password. Nothing to download. Free." |
| 17 | Old or used invite (missing) | Invites expire in 7 days and she checks email every few days. No expired screen exists. | Sees an error, assumes she broke it, doesn't call. | Viewer invites last 30 days. Expired screen: "This invite is too old. That's okay, it happens. Ask Chase for a new one." Button: "Call Chase". Never say "link expired". |
| 18 | All viewer screens | "Viewing as" picker and the green "You're seeing Hearth as…" banner, plus "Example · Photo" tags. | Fiddles with the picker. | Demo-only. Make sure none of it ships to viewers. (Fine to keep for Chase's demo.) |

### What Chase sees (poster role)

| # | Screen | Problem | What Chase would do | Fix (exact wording) |
|---|---|---|---|---|
| 19 | Share sheet | The caption box collapses to about 22 px; the placeholder is cut off. | Doesn't notice there's a caption box, so posts go out with no words, and June gets no context. | Caption box at least 2 lines (about 56 px). Placeholder: "Say what's happening (Grandma will see this)". |
| 20 | Share sheet | The Share button is below the fold at 360x740 at both sizes. He has to scroll inside the sheet. | Thinks it didn't load, or hunts for it. | Pin Cancel and Share to the bottom of the sheet. The button names the reach: "Share with 5 people". |
| 21 | Share sheet | Thumbnail remove × is 24 px on top of the photo. | Removes the wrong photo. | 44 px+ target with a label: "Remove". |
| 22 | Circles | Rename and Delete circle are orange text: 2.3:1 contrast, 21 px tall, side by side. | Taps Delete when he meant Rename, outdoors, one-handed with a kid on his hip. | Use ink-colored text on 48 px buttons. Move "Delete group" into the Rename sheet as a red button at the bottom. |
| 23 | Circles | In/out state on people pills is shown by color alone (green vs grey). 31 px tall. | Unsure who's in, especially in sunlight. | Show "✓ Grandma Jo" when in. 48 px tall. |
| 24 | Circles | The word "circle". Chase gets it, but it leaks into toasts ("Pick at least one circle", "Audience updated") and onto co-parent screens. | Fine for Chase. Alex or Nana Ruth (as poster) may not get it. | "Circle" → "group". "Audience updated" → "Saved. Only these people can see it now." "Pick at least one circle" → "Pick who should see it." |
| 25 | Invite ready | "Copy link" then a monospace code. He has to paste it into Messages himself. June gets a bare link with no context. | Pastes the bare link. June thinks it's spam. | Main button: **"Text it to Grandma Jo"**, which opens Messages with: "Hi Mom, it's Chase. I set up a private place for the kids' photos. Tap this to see them, no password: hearth.family/join/…". "Copy link" becomes the second button. Line: "Works for 30 days." |
| 26 | Invite sheet | No preview of what the person will receive. | Can't reassure Mom on the phone. | Under "Add them to": "Grandma Jo will get a text from you, then photos as you share them." |

## Acceptance criteria for qa-tdd

Suggested IDs: `UXG-xx` (grandparent UX). Each needs a ticket (E#) and must fail first, per TESTING.md. Use viewport 360x740 for these, not the suite's 390x844. "Viewer screens" means the feed, Help (Me) tab and full-screen viewer as Grandma Jo.

| ID | Test | Covers fix |
|---|---|---|
| UXG-01 | As Grandma Jo with a fresh page (no localStorage), `#bigText` is checked and `html` has class `big`. | 3, 15 |
| UXG-02 | As Grandma Jo with Larger text on, every element with its own visible text on the viewer screens has a computed `font-size` ≥ 17 px (excluding demo-only `.viewas`, `.banner`, `.tag`). | 3 |
| UXG-03 | Same screens: `document.documentElement.scrollWidth <= 360` (no sideways scrolling at big text). | 3 |
| UXG-04 | As Grandma Jo, every visible `button`, `input`, `select`, `a` and `label.check` on the viewer screens has a bounding box ≥ 48x48 (the box of a radio or checkbox may be its wrapping label). Any two targets in the same row are ≥ 8 px apart. | 6, 8, 5, 15 |
| UXG-05 | As Chase, the same 48 px rule holds for the Share sheet, Circles and Invite sheets (Rename, Delete, pills, ×, Change, Delete post, Share, Copy link). | 21, 22, 23 |
| UXG-06 | Contrast: for every visible text element in light and dark mode, computed color vs. nearest opaque background ≥ 4.5:1. In particular `.linkbtn` ≥ 4.5. | 22 |
| UXG-07 | Banned words: as Grandma Jo, `innerText` of the viewer screens plus the text and email previews matches none of `/\b(feed|circles?|audience|sync|upload|notifications?|app store|expired|account|settings|digest|roundup|posts?|react|servers?|encrypted)\b/i` (excluding demo-only elements). | 11-14, 1, 2 |
| UXG-08 | Full-screen viewer as Grandma Jo has a visible button named "Save to my phone". Clicking it fires a Playwright `download` event, then the toast "Saved to your Gallery" appears. | 4 |
| UXG-09 | Viewer bar text contains "From Chase" and the post's date. The caption text is visible in the viewer. | 5 |
| UXG-10 | On photo 1 of N, no "Back" button is visible. On photo N of N, no "Next" button is visible. Single-photo posts show neither. No `disabled` nav buttons rendered. | 5 |
| UXG-11 | Reaction buttons have visible text "Love it" and "Funny". | 6 |
| UXG-12 | Feed as Grandma Jo has a visible heading (`h1` or `h2`) containing "Photos of" above the first `article.post`. | 7 |
| UXG-13 | Text-message preview with `notify=text` starts with "From Chase on Hearth:" and contains none of `$`, "password", "code", "verify", "account". Email preview's sender is "Chase on Hearth". | 1, 2 |
| UXG-14 | As Grandma Jo, the tab formerly "Me" is labeled "Help". Its first card contains "Call Chase" and an `a[href^="tel:"]` ≥ 48 px tall. The "Bigger text" card comes before the notification choices. | 11 |
| UXG-15 | With media requests delayed 3 s via `page.route`, the text "Loading the photos" is visible within 500 ms and is gone once the media loads. | 10 |
| UXG-16 | A video in the feed is a button that opens the full-screen viewer. | 9 |
| UXG-17 | Opening the join link (prototype route, e.g. `#join/ABCD-1234`) shows "Chase invited you to see the family photos" and one primary button "See the photos". No password field on the page. | 16 |
| UXG-18 | Opening an expired join link (e.g. `#join/expired`) shows "This invite is too old" and a "Call Chase" `tel:` link. Page text does not contain "expired". | 17 |
| UXG-19 | Viewer invites say "Works for 30 days". The invite-ready sheet's first button is "Text it to [name]" with an `sms:` href whose body starts "Hi" and contains the join link. | 25, 17 |
| UXG-20 | Share sheet at 360x740, both text sizes, with 2 photos picked: `#share` is fully inside the viewport without scrolling, and its text matches /Share with \d+ (person|people)/. | 20 |
| UXG-21 | Share sheet: `#caption` bounding height ≥ 48 px. | 19 |
| UXG-22 | Circles: a pill that is "in" contains the visible text "✓". | 23 |
| UXG-23 | As Chase, no toast or sheet text contains "circle" or "audience" (for example after Save with nothing picked: "Pick who should see it"). | 24 |
| UXG-24 | Viewer role never renders `#viewer`, `.banner` or `.tag` when the demo flag is off (e.g. `?demo=0`). | 18 |

**Manual (add to M-cases):** on a real 4-year-old Galaxy A with system font size at maximum and on LTE with one bar: open the text, tap the link, see a photo, save it, find Call Chase. June does this with no help while someone times it. Pass = under 2 minutes and no call. Also confirm her phone's text setting actually makes the page bigger.

## Word list

| Don't say | Say |
|---|---|
| feed / Home (as a page title) | "Photos of Mia and Leo" |
| post / posts | photos ("2 new photos") |
| circle | group (Chase only; June never sees it) |
| audience / "Audience updated" | "who can see it" / "Saved. Only these people can see it now." |
| react / reactions | "Love it" / "Funny" buttons; "write back" |
| comment / "Add a comment" | "Write something back to Chase" |
| notification / App notification | "a sound on your phone" |
| digest / roundup | "an email every evening / every Sunday with the new photos" |
| Me (tab, for viewers) | Help |
| settings | (don't use; put the choices on Help) |
| Larger text | Bigger text |
| link expired | "This invite is too old. Ask Chase for a new one." |
| account | (drop it) / "everything" |
| upload | "before it leaves your phone" |
| servers / encrypted with keys | "Your photos stay in the United States, locked so only family can see them." |
| train AI | "No computer program learns from your photos." |
| Copy link (invite) | "Text it to Grandma Jo" |
| "Hearth: Chase shared…" | "From Chase on Hearth: …" |
