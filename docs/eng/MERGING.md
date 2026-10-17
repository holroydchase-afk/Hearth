# Merging pull requests

How a Hearth PR gets from branch to `main`. Chase is the only human reviewer, so Claude merges only when Chase asks in the project ("merge it", "get those merged").

## Before merging
1. **Chase said to merge.** A green PR still waits for his word. Claude never merges on its own call.
2. **CI is green on the latest commit**: Agent roster, Backend (SQL + Deno), App (Jest + typecheck).
3. **No merge conflict** (`mergeable_state` is `clean`). If it conflicts, merge `main` into the branch (no rebase or force-push), resolve, rerun the checks, then wait for green.
4. **Not a draft.** A draft is marked ready only when Chase asks to merge it and the thread that owns it says it is done pushing.
5. **Its owner is done.** A PR driven by another project thread is merged by that thread, or after it confirms.

## Order
- Merge PRs that others build on first. When a PR says it already contains another PR (e.g. "this branch also merges #3"), merge the contained one first.
- After each merge, re-check the next PR for conflicts and CI against the new `main` before merging it.

## How
- **Merge commit** (GitHub's "Create a merge commit"), matching the history on `main`. No squash, no rebase.
- Delete nothing by hand; branches can stay.
- After merging, the Claude that drove the PR says so in its thread in one line and resolves the thread when nothing else is owed.

## After merging
- Code that changes the hosted backend is not live until `backend/scripts/deploy.sh` runs (see its header). Merging is not deploying.
- If a merge breaks `main`, open a revert PR (GitHub's "Revert" button) instead of pushing to `main`.
