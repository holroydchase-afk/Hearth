# What Hearth can see (draft)

Draft, Oct 18, 2026. Not shown in the app yet. Words for relatives and parents, from the privacy path in `TRACKER.md` ("a 'what Hearth can see' page listing every vendor and what it can read"). Every line must match `docs/architecture/01-system-overview.md` and `04-threat-model.md`. If a line here and the code disagree, the code wins and this page gets fixed. grandparent-ux reviews the wording before anyone sees it.

---

## Who can see your photos

Only the people you share with, plus the kids' two parents. The parents can see every photo in the family.

If you weren't sent a photo, Hearth won't show it to you, and won't tell you it exists.

When you post, Hearth shows you how many people have seen it ("Seen by 3 of 5"). It never shows who looked, or when. (This one is under review, tracker D4.)

If someone is taken out of the family on Hearth, they can't open photos in Hearth any more. Photos they already saved to their own phone stay on their phone.

## The companies that help run Hearth

Hearth uses a few other companies. Here is what each one can see.

| Company | What it does | What it can see | What it can't see |
|---|---|---|---|
| **Backblaze** | Keeps the photos | Locked photo files, how big they are, when they were saved or opened, and the internet address of the phone that opened them | What's in the photos, captions and names. Photos are locked on your phone before they leave it |
| **Supabase** | Runs Hearth's computer: names, comments, who's in which group, and signing in | Everything Hearth's computer keeps (below), plus a sign-in record with your email and internet address | The photo files themselves. Those are kept at Backblaze, not Supabase |
| **Resend** | Sends Hearth's emails: your sign-in code, and "Chase shared new photos" | Your email address, your sign-in code, the sender's name, how many photos or comments, and a link to open Hearth | Photos, captions and comments |
| **Expo, Apple, Google** | Phone notices (coming later) | A code that tells them which phone to send to, the sender's name, how many, and which post it's about | Photos, captions and comments |

## What Hearth's own computer can see

To show the right photos to the right people, Hearth's computer keeps:

- names and email addresses
- who is in which group
- captions and comments
- the keys that unlock the photos

That means Hearth itself could open a photo if it had to, and anything Hearth's computer keeps could be handed over if a court orders it. Later, we plan a "family vault" where only your family's phones hold the keys. It isn't built yet.

## What Hearth never does

- No ads.
- No trackers.
- Your photos are never used to train AI.
- Location is removed from every photo on your phone, before it's sent.
- Your photos, comments and names are never sold. They go only to the companies listed above, to run Hearth.

## Where it's kept

Your photos and your family's information are stored in the United States.

A few things still pass through other countries. Supabase keeps its own short logs and has support staff outside the US. The company behind Supabase is based in Singapore. Phone notices travel through Apple and Google. We list these here so nothing is hidden, and we plan to remove them over time.

## Records

Hearth's own code never writes your internet address (your IP address) into its records, and its logs never hold the keys to your photos, photo links or captions. Supabase keeps short records of its own, which can include your internet address, and its sign-in record can be saved inside Hearth's computer too. On Supabase's free plan, it lists 1 day for most records and 1 hour for sign-in records.

---

**Not yet verified:** which Supabase plan Hearth is on; whether Supabase's own request logs include internet addresses for every request; and how long Supabase keeps backups. Both need checking on the account before this page ships. Source notes: `docs/architecture/04-threat-model.md` (Logs row).
