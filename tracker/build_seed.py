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

sql_lines = re.findall(r"^\s*(\d+)\s*\|\s*(ok|not ok|FAIL)\s*\|\s*(.+?)\s*$", ANSI.sub("", (RES / "backend-sql.txt").read_text()), re.M)
sql_cases, sql_res = [], {}
for n, status, desc in sql_lines:
    desc = re.sub(r"\s+\[.*\]$", "", desc).strip()
    cid = f"SQL-{int(n):03d}"
    sql_cases.append({"id": cid, "title": desc, "area": section_for(desc), "tickets": [], "where": "backend/tests/rls_test.sql"})
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
 ("M-06", "Android, no app: invite link opens web viewer", "Android", "Text an invite link to an Android phone without the app. Open it.", "Photos show in the browser; no app or password needed."),
 ("M-07", "iPhone to Android photo arrives full quality", "iPhone + Android", "Post from an iPhone to a circle with an Android grandparent who chose Text message link.", "Text arrives within a minute; photo opens sharp, not an MMS thumbnail."),
 ("M-08", "60-second video over cellular", "iPhone", "On cellular (Wi-Fi off), share a 60s video.", "Uploads in under 30s and plays on an older phone."),
 ("M-09", "Location removed from photos", "iPhone + Android", "Share a photo taken with location on. Download it on another phone and check its info.", "No GPS location in the file."),
 ("M-10", "Removed person loses access on their own phone", "Any", "Remove someone from a circle while they have the post open.", "Gone for them within 10 minutes; they can't reopen it."),
 ("M-11", "Co-parent separation with real accounts", "Any", "Two real households. Co-parent opens every screen.", "They never see the other side's circles, relatives, or posts not shared with them."),
 ("M-12", "Email digest arrives and links work", "Email", "Set a tester to Daily email digest; post 2 photos.", "One email that evening; links open the right photos."),
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
 ("S9", "bug", B, "Medium", "open", "Space managers can read invite code hashes; 8-character codes are crackable offline in about a day. Salt or lengthen codes.", []),
 ("S10", "bug", B, "Medium", "open", "No rate limit on redeeming invite codes", []),
 ("S11", "bug", B, "Medium", "open", "A guardian can unlink their child from the other household's space", []),
 ("S12", "bug", B, "Low", "open", "Removed members can still edit captions on their old posts", []),
 ("S13", "bug", B, "Low", "open", "Members of a deleted circle can still see each other's profiles", []),
 ("S14", "bug", B, "Low", "open", "Free-tier video cap is per space; someone can make extra spaces", []),
 ("S15", "bug", E_, "Low", "open", "Media can be marked ready without its key saved, which breaks that post (fails closed)", []),
 ("S16", "task", B, "High", "open", "Rerun the backend suite on a real Supabase stack before launch (today's runs use a stand-in)", []),
 ("E9", "enhancement", P, "High", "open", "Filter the feed by child (tag Mia / Leo on a post)", []),
 ("E10", "enhancement", P, "High", "open", "Save a photo to your phone (grandparents print them)", []),
 ("E11", "enhancement", P, "Medium", "open", "Undo for 10 seconds after deleting a post", []),
 ("E12", "enhancement", P, "Medium", "open", "Tell people about the 60-second video limit and free-tier video count when they pick a video", []),
 ("E13", "enhancement", P, "Medium", "open", "Invite status: joined or pending, plus resend and cancel", []),
 ("E14", "enhancement", P, "Medium", "open", "Upload progress and automatic retry on bad cell signal", []),
 ("E15", "enhancement", P, "Low", "open", "Multilingual app (Spanish first)", []),
 ("E16", "enhancement", P, "Low", "open", "Send a circle's photos to a smart frame", []),
]
# link backend tickets to SQL tests
for c in sql_cases:
    for t in c["tickets"]:
        for tk in tickets:
            if tk[0] == t: tk[6].append(c["id"])
for tk in tickets:
    if tk[0] == "S8": tk[6].extend(c["id"] for c in edge_cases)
write("tickets", "all", {"items": [{"id": i, "kind": k, "layer": l, "severity": s, "status": st, "title": t,
      "tests": sorted(set(ts)), "found": "2026-10-15", "fixed": "2026-10-15" if st == "fixed" else None}
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
    passed=sum(sql_res.values()), failed=len(sql_res) - sum(sql_res.values()), results={k: ("pass" if v else "fail") for k, v in sql_res.items()},
    note="Each of the 20 new tests failed before its fix; red counts weren't saved.")
run("r5", suite="edge", at="2026-10-15T00:55:00-04:00", label="Day 1 baseline", passed=5, failed=0, results={},
    note="Only passed with type-checking turned off (S8).")
run("r6", suite="edge", at="2026-10-15T08:05:00-04:00", label="After type fixes, type-checking on",
    passed=sum(edge_res.values()), failed=len(edge_res) - sum(edge_res.values()), results={k: ("pass" if v else "fail") for k, v in edge_res.items()})

print("proto", len(proto_cases), "red", sum(v == "fail" for v in red_map.values()), "| sql", len(sql_cases), "| edge", len(edge_cases),
      "| tickets", len(tickets), "| sec-linked", {t[0]: len(t[6]) for t in tickets if t[0].startswith("S")})
print("areas", sorted({c['area'] for c in sql_cases}))
