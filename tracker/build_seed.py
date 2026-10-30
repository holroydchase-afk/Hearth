#!/usr/bin/env python3
"""Build the Hearth Test Log seed data from real test output.

Reads:  e2e/results/run1-red.json, run2-green.json (Playwright JSON)
        e2e/results/backend-sql.txt, backend-deno.txt
Writes: tracker/seed/<collection>__<doc>.json  (one file per db document)

Re-run after any test run, then push the changed docs to the artifact db.
"""
import json, re, os, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RES = ROOT / "e2e/results"
OUT = ROOT / "tracker/seed"; OUT.mkdir(parents=True, exist_ok=True)
ANSI = re.compile(r"\x1b\[[0-9;]*m")

def write(coll, doc, data):
    (OUT / f"{coll}__{doc}.json").write_text(json.dumps(data, ensure_ascii=False, indent=1))

# ---------------- Prototype e2e ----------------
TICKET_RE = re.compile(r"\(((?:[BE]\d+)(?:,\s*[BE]\d+)*)\)")
def pw_results(fname):
    j = json.loads((RES / fname).read_text())
    out = {}
    def walk(s):
        for sp in s.get("specs", []):
            cid = sp["title"].split(" ")[0]
            ok = all(t["results"] and t["results"][-1]["status"] == "passed" for t in sp["tests"])
            out.setdefault(cid, {"title": sp["title"], "ok": True})
            out[cid]["ok"] = out[cid]["ok"] and ok
        for c in s.get("suites", []): walk(c)
    for s in j["suites"]: walk(s)
    return out

red, green = pw_results("run1-red.json"), pw_results("run2-green.json")
AREA = {"VIS": "Who sees what", "ROLE": "Roles", "POST": "Sharing", "CIR": "Circles", "INV": "Invites",
        "NOTE": "Notifications", "COM": "Comments", "VIEW": "Viewing", "A11Y": "Accessibility", "SEC": "Security"}
proto_cases = []
for cid, r in green.items():
    title = re.sub(r"^\S+\s", "", r["title"])
    title = re.sub(r"\s*\((light|dark)\)$", "", title)
    tickets = TICKET_RE.findall(title)
    title = TICKET_RE.sub("", title).strip()
    proto_cases.append({"id": cid, "title": title, "area": AREA[cid.split("-")[0]],
                        "tickets": [t.strip() for t in ",".join(tickets).split(",") if t.strip()],
                        "where": "e2e/tests/hearth.spec.js"})
# test-harness tickets
for c in proto_cases:
    if c["id"] == "VIS-01": c["tickets"].append("T1")
    if c["id"] == "A11Y-04": c["tickets"].append("T2")
    if c["id"] == "ROLE-01": c["tickets"].append("B10")
write("suites", "prototype", {"name": "Prototype (browser tests)", "kind": "auto",
      "how": "cd e2e && npx playwright test   (iPhone-size Chromium, light + dark)", "order": 1, "cases": proto_cases})

# ---------------- Backend SQL ----------------
src = (ROOT / "backend/tests/rls_test.sql").read_text()
sections = [(m.start(), m.group(1).strip()) for m in re.finditer(r"^-- \d+\.\s*(.+)$", src, re.M)]
SECT_NAME = {
 1: "Grandparent separation", 2: "Grandparent separation", 3: "Co-parent separation", 4: "Owner access",
 5: "Revoking access", 6: "Uploads and free-tier cap", 7: "Invites", 8: "Deletion and export", 9: "Security review fixes"}
def section_for(desc):
    key = re.escape(desc[:45].replace("'", "''"))
    m = re.search(key, src) or re.search(re.escape(desc[:25]), src)
    if not m: return "Other"
    idx = 0
    for i, (pos, _) in enumerate(sections):
        if pos < m.start(): idx = i + 1
    return SECT_NAME.get(idx, "Other")

# backend-sql.txt holds every suite run.sh runs, each numbered from 1 and closed by "<NAME> RESULT:".
# The first (rls_test.sql) keeps the SQL-nnn ids older runs used; the others are <NAME>-nnn (T6: before,
# every suite's case 1 became SQL-001 and overwrote the others).
SUITE_FILE = {"SQL": "rls_test.sql", "API": "api_test.sql", "NOTIFY": "notify_test.sql", "SETUP": "setup_test.sql",
              "REPLY": "reply_test.sql", "TIMELINE": "timeline_test.sql", "GROUPS": "groups_test.sql",
              "TIMELINE-FUTURE": "timeline_future_test.sql", "PRIVACY-AUDIT": "privacy_audit_test.sql", "AUD-16": "aud16/"}
SUITE_AREA = {"API": "API contract", "NOTIFY": "Notices", "SETUP": "Family setup", "REPLY": "Who reads replies",
              "TIMELINE": "Timeline", "GROUPS": "Groups, households, events", "TIMELINE-FUTURE": "Timeline",
              "PRIVACY-AUDIT": "Privacy audit (no raw IPs)", "AUD-16": "Groups, households, events"}
sql_txt = ANSI.sub("", (RES / "backend-sql.txt").read_text())
sql_cases, sql_res = [], {}
for chunk, name in re.findall(r"(.*?)^([A-Z0-9 -]*?)\s*RESULT:[^\n]*$", sql_txt, re.M | re.S):
    name = (name.strip() or "SQL").replace(" ", "-")
    for n, status, desc in re.findall(r"^\s*(\d+)\s*\|\s*(ok|not ok|NOT OK|FAIL)\s*\|\s*(.+?)\s*$", chunk, re.M):
        desc = re.sub(r"\s+\[.*\]$", "", desc).strip()
        cid = f"{name}-{int(n):03d}"
        area = section_for(desc) if name == "SQL" else SUITE_AREA.get(name, name.title())
        sql_cases.append({"id": cid, "title": desc, "area": area, "tickets": [],
                          "where": "backend/tests/" + SUITE_FILE.get(name, "")})
        sql_res[cid] = status == "ok"
SEC_TICKETS = {"S1": ["removed", "no longer a member", "left the space", "former member"],
               "S2": ["publish", "viewers_can_post"], "S3": ["mime", "kind"], "S4": ["billing", "plan_customer", "quota", "video count"],
               "S5": ["child", "half-sibling"], "S6": ["birth"], "S7": ["edit their comment", "lost access to a post cannot edit"]}
for c in sql_cases:
    if c["area"] == "Security review fixes":
        low = c["title"].lower()
        for t, keys in SEC_TICKETS.items():
            if any(k in low for k in keys): c["tickets"].append(t)
write("suites", "backend", {"name": "Backend privacy rules (database)", "kind": "auto",
      "how": "cd backend && bash tests/run.sh   (Postgres 16 + Supabase auth stand-in)", "order": 2, "cases": sql_cases})

# ---------------- Edge function (Deno) ----------------
deno_txt = ANSI.sub("", (RES / "backend-deno.txt").read_text())
deno = re.findall(r"^(.+?) \.\.\. (ok|FAILED)", deno_txt, re.M)
edge_cases, edge_res = [], {}
for i, (name, st) in enumerate(deno, 1):
    cid = f"EDGE-{i:02d}"
    edge_cases.append({"id": cid, "title": name.strip(), "area": "Media signing", "tickets": [], "where": "backend/supabase/functions/sign-media/"})
    edge_res[cid] = st == "ok"
write("suites", "edge", {"name": "Media signing function", "kind": "auto",
      "how": "cd backend && deno test --allow-env supabase/functions/sign-media/", "order": 3, "cases": edge_cases})

# ---------------- Manual cases ----------------
manual = [
 ("M-01", "Grandparent finds the newest photo and comments", "Prototype", "Hand your phone to a grandparent with the prototype open as their name. Ask them to find the newest photo and leave a comment. Don't help.", "Done in under a minute with no help."),
 ("M-02", "Someone can tell who sees a post", "Prototype", "Show an adult one of your posts. Ask: who can see this?", "They answer correctly from the screen alone."),
 ("M-03", "Larger text is readable at arm's length", "Prototype", "As a grandparent, turn on Larger text in Me. Hold the phone at arm's length.", "Captions and comments readable without glasses (or with their usual pair)."),
 ("M-04", "New circle end to end", "Prototype", "Make a circle, add 2 people, share a photo only to it, then switch Viewing as to someone outside it.", "Only the 2 people see it; the outsider sees nothing."),
 ("M-05", "Install from TestFlight link on iPhone", "iPhone", "Open the TestFlight public link on an iPhone that has never had Hearth.", "Installed and signed in by text link in under 3 minutes. Blocked until build #1."),
 ("M-07", "iPhone to Android photo arrives full quality", "iPhone + Android", "Post from an iPhone to a circle with an Android grandparent who chose Text message link.", "Text arrives within a minute; photo opens sharp, not an MMS thumbnail."),
 ("M-08", "60-second video over cellular", "iPhone", "On cellular (Wi-Fi off), share a 60s video.", "Uploads in under 30s and plays on an older phone."),
 ("M-09", "Location removed from photos", "iPhone + Android", "Share a photo taken with location on. Download it on another phone and check its info.", "No GPS location in the file."),
 ("M-10", "Removed person loses access on their own phone", "Any", "Remove someone from a circle while they have the post open.", "Gone for them within 10 minutes; they can't reopen it."),
 ("M-11", "Co-parent separation with real accounts", "Any", "Two real households. Co-parent opens every screen.", "They never see the other side's circles, relatives, or posts not shared with them."),
 ("M-12", "Email digest arrives and links work", "Email", "Set a tester to Daily email digest; post 2 photos.", "One email that evening; links open the right photos."),
 ("M-13", "BETA-BULK-1/7 Bulk pick keeps the date taken (Expo Go)", "iPhone", "In Expo Go, bulk-pick 20 photos from 2 trips: one abroad, one Live Photo, one HEIC, one screenshot with no date. Send to a test group. Open By date.", "Each photo sits under the month and day it was taken (the abroad one on its local day); the screenshot sorts by today. If Expo Go returns no EXIF date, stop and report (plan stop rule)."),
 ("M-14", "BETA-BULK-4/7 Bulk send survives no network, then network", "iPhone", "Bulk-pick 48 photos. Tap Send, then turn on airplane mode at about 'Sending 12 of 48'. Force-quit. Wait 1 minute, turn airplane mode off, reopen Hearth.", "It finishes on its own: 48 photos in the right posts, none twice. The other phone gets 1 notice. A downloaded copy has no location."),
 ("M-15", "BETA-AUD-17 Share sheet: Everyone first, then Groups, then Events", "iPhone", "On Chase's iPhone, Chase and then Mom each share one photo to Everyone and one to the Charleston trip. Then ask each: who sees this one?", "Everyone is first and takes 1 tap; Groups then Events follow, each as name plus 'N people'; both answer 'who sees this?' correctly from the screen alone (2 of 2)."),
 ("M-16", "BETA-AUD-22 Make an event unaided (milestone 4)", "iPhone", "Ask Chase to make 'Thanksgiving 2026' by ticking groups and households. Time it. Don't help.", "Under 60 seconds; it shows under Events in the share sheet as name plus 'N people'; the screen says everyone in it can read each other's comments on its photos."),
 # QA-4 (Oct 18): the real app's cases. M-06 (web viewer for Android without the app) is dropped: not in BETA-SPEC.
 ("M-17", "BETA-JOIN-5 Still signed in after 7 days", "iPhone", "Sign in, then don't open Hearth for 7 days. Open it.", "Photos open straight away; no new code asked for."),
 ("M-18", "BETA-NOTIFY-1 Notices arrive within a minute", "iPhone + account B", "As B, comment on 10 posts over 2 days. Note when each notice arrives (the Help screen's timing log, AE-10).", "9 of 10 arrive within 1 minute."),
 # Milestone 1 demo (docs/product/MILESTONE-1.md): Chase's iPhone in Expo Go plus account B on the web build.
 ("M1-01", "BETA-JOIN-2 Sign in with the 6-digit email code", "iPhone (Expo Go)", "Sign in with your email; type the 6-digit code from the email.", "In within a minute; no password."),
 ("M1-02", "BETA-JOIN-1 Account B joins with the Test house code", "Web build", "As account B, tap 'I have an invite code' and type the Test house code.", "B joins and sees only Everyone and Test house posts."),
 ("M1-03", "BETA-SHARE-1 Post 3 photos to Test house in 3 taps or fewer", "iPhone (Expo Go)", "Post 3 photos to 'Test house'.", "At the top of your Photos right away; B sees all 3 within a minute."),
 ("M1-04", "BETA-SEE-3 Full screen with buttons", "Web build", "As B: tap a photo, use Next/Back, then Close.", "Full screen; buttons work, not just swipes."),
 ("M1-05", "BETA-AUD-1 A post to Gammy's house never reaches B", "iPhone (Expo Go)", "Post 1 photo to 'Gammy's house' only.", "B never sees it."),
 ("M1-06", "BETA-SHARE-4 Airplane mode, then network", "iPhone (Expo Go)", "Turn on airplane mode, post, turn it off.", "It sends on its own."),
 ("M1-07", "BETA-REPLY-3 / NOTIFY-4 Comment and heart send one email notice", "Web build + email", "As B: comment and heart.", "You get one email notice."),
 ("M1-08", "M-09 / BETA-SEE-5 Save to phone, no location", "iPhone (Expo Go)", "Save a photo to your phone; check its info in Photos.", "It's there at 2048 px with no location."),
 ("M1-09", "Gate: 10+ posts over 2 days, 0 lost (QA-3)", "iPhone + web build", "Keep posting until 10+ posts over 2 days, then run backend/scripts/sent-vs-received.sh (MILESTONE-1.md).", "RESULT: sent N, received N, lost 0; 0 crash reports."),
 ("M1-10", "BETA-BULK-1 fallback: a screenshot gets its date", "iPhone (Expo Go)", "Bulk-pick a screenshot (no EXIF date) with 2 normal photos.", "The screenshot sits under the day it was taken, not undated."),
]
write("suites", "manual", {"name": "Manual tests (people + real phones)", "kind": "manual",
      "how": "Run on a real phone, then log the result on this page.", "order": 4,
      "cases": [{"id": i, "title": t, "area": a, "steps": s, "expected": e, "tickets": []} for i, t, a, s, e in manual]})

# ---------------- Tickets ----------------
P, B, E_ = "prototype", "backend", "edge"
tickets = [
 # prototype bugs (found 2026-10-15 by test-first review)
 ("B1", "bug", P, "Medium", "fixed", "Copying the invite link crashed when the phone blocks clipboard access", ["INV-01"]),
 ("B2", "bug", P, "High", "fixed", "Co-parent could see the other household's relatives in Circles", ["VIS-07"]),
 ("B3", "bug", P, "Low", "fixed", "Notification preview always said 'Chase shared photos of Mia'", ["NOTE-01"]),
 ("B4", "bug", P, "Low", "fixed", "Choosing an empty circle said 'Pick at least one circle'", ["POST-03"]),
 ("B5", "bug", P, "Medium", "fixed", "Grandparents saw a dead Share button and gaps in the tab bar", ["ROLE-01"]),
 ("B6", "bug", P, "Medium", "fixed", "A half-typed comment was wiped when anyone reacted", ["COM-01"]),
 ("B7", "bug", P, "Low", "fixed", "Duplicate circle names were allowed", ["CIR-01"]),
 ("B8", "bug", P, "Low", "fixed", "Share sheet's default audience carried over between people", ["POST-05"]),
 ("B9", "bug", P, "Medium", "fixed", "Sheets didn't take focus or close with Escape", ["A11Y-01"]),
 ("B10", "bug", P, "Medium", "fixed", "Hidden tabs reappeared outside the artifact preview (CSS beat the hidden attribute). Found by ROLE-01 during the fix run.", ["ROLE-01"]),
 ("E1", "enhancement", P, "High", "fixed", "Delete your own post, with a confirm step", ["POST-07"]),
 ("E2", "enhancement", P, "High", "fixed", "Tap a photo for full screen, swipe or arrow between photos", ["VIEW-01"]),
 ("E3", "enhancement", P, "High", "fixed", "Invite flow: name, role and circles chosen up front, then a link to text", ["INV-02", "INV-01"]),
 ("E4", "enhancement", P, "Medium", "fixed", "'Seen by 3 of 5' on your own posts", ["VIEW-02"]),
 ("E5", "enhancement", P, "Medium", "fixed", "Larger text setting for grandparents", ["A11Y-02"]),
 ("E6", "enhancement", P, "Medium", "fixed", "Remove a picked photo before sharing", ["POST-04"]),
 ("E7", "enhancement", P, "Medium", "fixed", "Rename and delete circles; deleting is blocked if a post would lose its only audience", ["CIR-02", "CIR-03"]),
 ("E8", "enhancement", P, "Medium", "fixed", "Removing someone from a circle says how many posts they lost", ["VIS-06"]),
 ("T1", "test fix", P, "Low", "fixed", "Test selector also matched the Share tab (shared 'post' class). Renamed the tab's class in the app and tightened the test.", ["VIS-01"]),
 ("T2", "test fix", P, "Low", "fixed", "Blocked web fonts were counted as script errors in tests", ["A11Y-04"]),
 ("T3", "test fix", "app", "Low", "fixed", "pick.test used a dynamic import, which Jest can't run without VM modules; switched to a static import", []),
 ("T4", "test fix", "app", "Medium", "fixed", "Time-zone tests set process.env.TZ, which Jest's sandbox ignores, so no-offset dates were read as UTC. The phone's zone is now an explicit option (default from Intl)", []),
 ("T5", "test fix", "app", "Medium", "fixed", "Flaky: bulk.test 'Send makes 5 posts' checked the whole fake backend for /GPS|Apple/ including random base64 ciphertext, which sometimes spells 'GPS' (failed 3 of 4 full runs, 1 of 5 alone). Now checks everything except the encrypted blobs; EXIF in the bytes is checked before encryption by the pipeline tests", []),
 # backend security review (agent, 2026-10-15)
 ("S1", "bug", B, "High", "fixed", "Someone removed from the family space kept access to their own old posts: new comments, photos and keys", []),
 ("S2", "bug", B, "Medium", "fixed", "A view-only member could publish a draft after posting was turned off for viewers", []),
 ("S3", "bug", B, "Medium", "fixed", "A video labeled as a photo slipped past the 10-video free cap", []),
 ("S4", "bug", B, "Medium", "fixed", "Co-parent could read billing details and the space's video count", []),
 ("S5", "bug", B, "Medium", "fixed", "Co-parent could see a child linked to the other household (e.g. a new half-sibling) with nothing shared", []),
 ("S6", "bug", B, "Low", "fixed", "Children's birth dates were readable by all members", []),
 ("S7", "bug", B, "Low", "fixed", "Could edit your comment on a post you can no longer see", []),
 ("S8", "bug", E_, "Low", "fixed", "Edge function failed type-checking on current Deno, so the documented test command didn't run", []),
 # open backlog
 ("S9", "bug", B, "Medium", "fixed", "Space managers can read invite code hashes; 8-character codes are crackable offline in about a day. Salt or lengthen codes.", []),
 ("S10", "bug", B, "Medium", "fixed", "No rate limit on redeeming invite codes", []),
 ("S11", "bug", B, "Medium", "fixed", "A guardian can unlink their child from the other household's space", []),
 ("S12", "bug", B, "Low", "fixed", "Removed members can still edit captions on their old posts", []),
 ("S13", "bug", B, "Low", "fixed", "Members of a deleted circle can still see each other's profiles", []),
 ("S14", "bug", B, "Low", "open", "Free-tier video cap is per space; someone can make extra spaces", []),
 ("S15", "bug", E_, "Low", "fixed", "Media can be marked ready without its key saved, which breaks that post (fails closed)", []),
 ("S16", "task", B, "High", "fixed", "Rerun the backend suite on a real Supabase stack before launch (today's runs use a stand-in)", []),
 ("E9", "enhancement", P, "High", "open", "Filter the feed by child (tag Mia / Leo on a post)", []),
 ("E10", "enhancement", "app", "High", "fixed", "Save a photo to your phone (grandparents print them)", []),
 ("E11", "enhancement", P, "Medium", "open", "Undo for 10 seconds after deleting a post", []),
 ("E12", "enhancement", P, "Medium", "open", "Tell people about the 60-second video limit and free-tier video count when they pick a video", []),
 ("E13", "enhancement", P, "Medium", "open", "Invite status: joined or pending, plus resend and cancel", []),
 ("E14", "enhancement", "app", "Medium", "fixed", "Upload progress and automatic retry on bad cell signal", []),
 ("E15", "enhancement", P, "Low", "open", "Multilingual app (Spanish first)", []),
 ("E16", "enhancement", P, "Low", "open", "Send a circle's photos to a smart frame", []),
 # QA-5 (Oct 18): app-engineer work items as tickets, and what BETA-SPEC defers
 ("AE-2", "enhancement", B, "High", "fixed", "Notification sender: outbox (0003) plus the notify function (Expo Push + Resend), 1-minute cron", []),
 ("AE-3", "task", "app", "High", "open", "First real-device pass on Chase's iPhone: resize, EXIF scan (M-09), encrypted upload, save to phone, code sign-in", []),
 ("AE-4", "task", "app", "Medium", "fixed", "Publish to Expo Go as an EAS Update (branch preview) and the web build", []),
 ("AE-5", "enhancement", "app", "Medium", "fixed", "'Take me off Hearth' for non-owners (BETA-JOIN-7)", []),
 ("AE-6", "task", "app", "Medium", "open", "TestFlight external submission (milestone 3, after the name is final)", []),
 ("AE-7", "enhancement", B, "Medium", "fixed", "Our own error reports, fixed fields only, 30 days (0006, BETA-OPS-1)", []),
 ("AE-8", "bug", B, "Low", "fixed", "S12: removed members can't edit their old captions (0005, BETA-REPLY-4)", []),
 ("V1", "enhancement", "app", "Medium", "deferred", "Video posting: off until location can be stripped from video too (BETA-SPEC)", []),
 ("REPLY-1", "enhancement", "app", "Low", "deferred", "BETA-REPLY-1, deferred in BETA-SPEC", []),
 # Overnight Oct 18 (privacy first)
 ("PRIV-1", "bug", B, "Medium", "fixed", "The invite rate limit kept raw IP addresses, and the last ones could stay forever. Now a keyed hash, purged daily, pepper replaced daily (0012)", []),
 ("PRIV-2", "bug", "ops", "Medium", "fixed", "Nothing stopped a log line from printing a key, URL or caption; sign-media logged raw error messages. CI log check added", []),
 ("QA-3", "task", "ops", "High", "fixed", "Sent-vs-received check for the milestone 1 gate's '0 lost' (backend/scripts/sent-vs-received.sh)", []),
 ("QA-2", "task", "ops", "High", "fixed", "Read-only smoke check of the hosted project (D1; backend/scripts/smoke-check.sh)", []),
 ("BULK-1F", "enhancement", "app", "High", "fixed", "Photos with no EXIF date take the photo library's creation time, with no new permission prompt", []),
 ("T7", "test fix", "app", "Low", "fixed", "Contract test BETA-TIME-4 failed on the real-API harness (also on main): BETA-TIME-2 had made a 2019 post in the same database. It now uses years no other test uses", []),
 ("T6", "test fix", "ops", "Medium", "fixed", "Test Log builder gave every backend suite's case 1 the same id (SQL-001), so later suites overwrote earlier ones. Ids are now per suite", []),
 # Messenger build and its crypto review (Oct 19, PR #29)
 ("S17", "bug", "app", "High", "fixed", "In Expo Go, keys could come from Math.random: expo-crypto's getRandomBytes falls back to it in dev builds. Hit photo keys, the local-storage key and chat keys. Now getRandomValues only, and it fails rather than fall back (MS4 tests)", []),
 ("S18", "bug", "app", "Medium", "open", "Photos encrypted in Expo Go before the S17 fix may have guessable keys. Milestone 1 test data only; clear the test bucket before any real family photos go in", []),
 ("S19", "bug", "app", "Medium", "open", "Messenger has no key check (safety numbers): a compromised server could add a hidden phone to a chat (MS4)", []),
 ("S20", "task", "app", "Medium", "open", "Outside review of app/src/messenger/mlsCrypto.ts, our own HPKE and ciphersuite glue around audited libraries (not audited)", []),
 ("T8", "test fix", "app", "Low", "fixed", "Messenger crypto has no RFC 9180 known-answer vectors, and export is interop-tested in one direction only", []),
 ("T9", "test fix", "ops", "Low", "fixed", "QA-3 sent_received_test fails when run on 2026-10-19: seed posts dated that day land in its 'since today' window (also on main)", []),
 ("T10", "test fix", "app", "Low", "fixed", "The fake backend's chatFetch has no joined-at cutoff, so app tests don't cover 'newcomers can't fetch older chat rows' (SQL tests do)", []),
 # privacy-security review, Oct 28 (docs/reviews/2026-10-28-harden.md)
 ("S21", "bug", B, "High", "fixed", "HARD-12: members could write reactions straight through PostgREST, skipping the three-emoji list and 'replies off' (a free-text side channel). Migration 0018", []),
 ("S22", "bug", "app", "Medium", "fixed", "HARD-13: the cached feed (captions, names, reactions) stayed on the phone after sign out", []),
 ("B11", "bug", "app", "Medium", "open", "HARD-14: a reaction summary read before a tap can land after it and hide the confirmed reaction until the next refresh", []),
 ("T11", "test fix", "app", "Low", "open", "HARD-15: Fake and Supabase disagree on reacting to your own unpublished post (the contract doesn't cover it)", []),
 ("B13", "bug", B, "High", "fixed", "HARD-17: Postgres JIT-compiled feed_rows once a family had a few dozen posts: 1.5-2 s per Photos or By date page instead of 20-50 ms. Migration 0018 turns JIT off for it", []),
 ("B12", "bug", "app", "Low", "fixed", "HARD-16: on a server before 0017, Haha or Like takes away an existing heart (the hosted server has 0017)", []),
]
# When each ticket was found and fixed, where it isn't Oct 15.
DATES = {"S9": ("2026-10-15", "2026-10-16"), "S10": ("2026-10-15", "2026-10-16"), "S12": ("2026-10-15", "2026-10-16"),
         "S16": ("2026-10-15", "2026-10-17"), "S11": ("2026-10-15", "2026-10-18"), "S13": ("2026-10-15", "2026-10-18"), "S15": ("2026-10-15", "2026-10-18"), "E10": ("2026-10-15", "2026-10-16"), "E14": ("2026-10-15", "2026-10-16"),
         "AE-2": ("2026-10-16", "2026-10-16"), "AE-3": ("2026-10-16", None), "AE-4": ("2026-10-16", "2026-10-18"),
         "AE-5": ("2026-10-16", "2026-10-16"), "AE-6": ("2026-10-16", None), "AE-7": ("2026-10-16", "2026-10-16"),
         "AE-8": ("2026-10-16", "2026-10-16"), "V1": ("2026-10-16", None), "REPLY-1": ("2026-10-16", None),
         **{t: ("2026-10-18", "2026-10-18") for t in ("PRIV-1", "PRIV-2", "QA-3", "QA-2", "BULK-1F", "T6", "T7")},
         "S17": ("2026-10-19", "2026-10-19"), **{t: ("2026-10-19", None) for t in ("S18", "S19", "S20")}, **{t: ("2026-10-19", "2026-10-21") for t in ("T8", "T9", "T10")}}
# link backend tickets to SQL tests
for c in sql_cases:
    for t in c["tickets"]:
        for tk in tickets:
            if tk[0] == t: tk[6].append(c["id"])
for tk in tickets:
    if tk[0] == "S8": tk[6].extend(c["id"] for c in edge_cases)
# a ticket id written in a test's title, e.g. "BETA-JOIN-4 (S9) ..." or "PRIV-1 ..."
ids = {tk[0] for tk in tickets}
for c in sql_cases:
    for t in re.findall(r"\b(S\d+|PRIV-\d+)\b", c["title"]):
        if t in ids:
            next(tk for tk in tickets if tk[0] == t)[6].append(c["id"])
write("tickets", "all", {"items": [{"id": i, "kind": k, "layer": l, "severity": s, "status": st, "title": t,
      "tests": sorted(set(ts)), "found": DATES.get(i, ("2026-10-15",))[0],
      "fixed": DATES[i][1] if i in DATES else ("2026-10-15" if st == "fixed" else None)}
      for i, k, l, s, st, t, ts in tickets]})

# ---------------- Runs ----------------
def run(doc, **kw): write("runs", doc, kw)
red_map = {k: ("pass" if v["ok"] else "fail") for k, v in red.items()}
green_map = {k: ("pass" if v["ok"] else "fail") for k, v in green.items()}
run("r1", suite="prototype", at="2026-10-15T08:12:00-04:00", label="Tests written first, run against prototype v1",
    passed=sum(v == "pass" for v in red_map.values()), failed=sum(v == "fail" for v in red_map.values()), results=red_map,
    note="Red on purpose: 18 failures were real bugs or missing features. 2 (VIS-01, A11Y-04) were test bugs, fixed as T1 and T2. Counts are per case; A11Y-03 covers light and dark.")
run("r2", suite="prototype", at="2026-10-15T08:30:00-04:00", label="Prototype v2 after fixes",
    passed=sum(v == "pass" for v in green_map.values()), failed=sum(v == "fail" for v in green_map.values()), results=green_map,
    note="Green 3 runs in a row (no flaky tests). The first fix run found B10, fixed before this run.")
run("r3", suite="backend", at="2026-10-15T00:55:00-04:00", label="Day 1 backend baseline", passed=90, failed=0, results={},
    note="Per-test results weren't saved for this run. The 20 security tests didn't exist yet.")
run("r4", suite="backend", at="2026-10-15T08:05:00-04:00", label="After security review (7 holes fixed)",
    passed=sum(v for k, v in sql_res.items() if k.startswith("SQL-")), failed=sum(not v for k, v in sql_res.items() if k.startswith("SQL-")),
    results={k: ("pass" if v else "fail") for k, v in sql_res.items() if k.startswith("SQL-")},   # rls_test.sql only, as on Oct 15
    note="Each of the 20 new tests failed before its fix; red counts weren't saved.")
run("r5", suite="edge", at="2026-10-15T00:55:00-04:00", label="Day 1 baseline", passed=5, failed=0, results={},
    note="Only passed with type-checking turned off (S8).")
run("r6", suite="edge", at="2026-10-15T08:05:00-04:00", label="After type fixes, type-checking on",
    passed=sum(edge_res.values()), failed=len(edge_res) - sum(edge_res.values()), results={k: ("pass" if v else "fail") for k, v in edge_res.items()})

run("r7", suite="backend", at="2026-10-17T05:30:00-04:00", label="Bulk photos + timeline tests written first (red, no 0010 yet)",
    passed=376, failed=39, results={},
    note="Red on purpose. New: timeline_test.sql 30 of 31 red (missing get_timeline, get_timeline_years, private.visible_posts, index); notify_test.sql 9 BETA-BULK-6 batch-notice cases red (create_post has no p_batch_id). Existing suites unchanged and green: rls 116, api 169, notify 48, setup 5, reply 37. Timeline tests checked green against a throwaway reference. Deno notify wording tests (4) not run here: no deno binary.")
run("r8", suite="app", at="2026-10-17T05:30:00-04:00", label="Bulk photos + timeline app tests written first (red)",
    passed=247, failed=35, results={},
    note="Red on purpose: not-built stubs for takenAtFromAsset, planBatch, pickBulk, enqueueBatch/batchProgress/batchLabel and getTimeline/getTimelineYears; FakeApi accepts batchId without batchSize. Existing 245 still green; typecheck clean. 2 test bugs found and fixed before this run: T3 (dynamic import in pick.test) and T4 (process.env.TZ ignored by Jest's sandbox; the phone zone is now an explicit option).")
run("r9", suite="backend", at="2026-10-17T07:30:00-04:00", label="Groups, households, events, roles, share history: tests written first (red, no 0011 yet)",
    passed=465, failed=139, results={},
    note="Red on purpose. New: groups_test.sql 119 of 137 red (no circles.kind, circle_links, circle_people, can, can_send_to, create_level, link_level, place_person, reply_readers, invites.history, sees_from; the 0009 switch still exists). The 18 passing are refusal or 'sees nothing' guards that pass trivially until the fixture can be built. aud16 (BETA-AUD-16 snapshot before/after 0011): 4 of 11 red only because 0011 isn't there; the 7 diff checks pass on a no-op, which shows the diff itself raises no false alarm. setup_v2_test.sh 12 of 14 red (no family-setup-v2.sql). timeline_future_test.sql 4 of 6 red (taken_at after published_at still sorts and counts by taken_at). Existing suites unchanged and green: rls 120, api 169, notify 60, setup 5, reply 44, timeline 38. Same counts on 3 runs. Deno tests not run: no deno binary here.")
run("r10", suite="app", at="2026-10-17T07:30:00-04:00", label="Groups + bulk/timeline follow-ups: app tests written first (red)",
    passed=313, failed=15, results={},
    note="Red on purpose: invite form has no share-history choice (AUD-19, 4); the reply switch and setGroupRepliesShared still exist (REPLY-12, 2); the comment box doesn't call replyReaders (REPLY-11, 2); a relative who can post still gets 'Pick lots of photos' (1); a timeline card can't open its post (2); the phone keeps capture dates more than a day ahead (4). Existing 311 green, 1 skipped; typecheck clean; web smoke test 1/1. Found and fixed T5 (flaky ciphertext regex in bulk.test) on the way; after it, 3 full runs gave identical counts.")
run("r11", suite="backend", at="2026-10-18T03:30:00-04:00", label="Overnight privacy audit: PRIV-1 written first (red), then migration 0012",
    passed=sum(sql_res.values()), failed=len(sql_res) - sum(sql_res.values()), results={k: ("pass" if v else "fail") for k, v in sql_res.items()},
    note="PRIV-1 was red 2 of 6 before 0012, S11 and S13 1 each and S15 2 before their fixes (raw IP stored; stale rows never purged); the pepper-rotation check was added after privacy-security's review. "
         "Green 3 runs in a row with every other suite unchanged. Also green 3x, not in this table: QA-3 sent-vs-received 20/20, D1 smoke check 20/20, "
         "SETUP-API 34, SETUP V2 15, deploy 20, PRIV-2 log check 11/11 (red first on sign-media). Deno not run here (CI only).")
run("r12", suite="app", at="2026-10-18T03:00:00-04:00", label="BETA-BULK-1 fallback: creation time for undated photos (red, then green)",
    passed=351, failed=0, results={},
    note="pickCreationTime.test.ts was red 3 of 8 before the change (no creation time read). After: Jest 351 passed, 1 skipped, the same on 3 runs; typecheck clean.")
print("proto", len(proto_cases), "red", sum(v == "fail" for v in red_map.values()), "| sql", len(sql_cases), "| edge", len(edge_cases),
      "| tickets", len(tickets), "| sec-linked", {t[0]: len(t[6]) for t in tickets if t[0].startswith("S")})
print("areas", sorted({c['area'] for c in sql_cases}))
