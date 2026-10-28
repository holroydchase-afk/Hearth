#!/usr/bin/env bash
# AGENTS-1/2: Hearth's studio agents = the studio-agents text, then a "Hearth notes" section built from
# docs/eng/AGENT-NOTES.md ("## Every agent" plus "## <agent>"). Edit Hearth facts in the notes file, never
# in .claude/agents/, then re-run this. Agents not in STUDIO_AGENTS (grandparent-ux) are left alone.
#   bash scripts/sync-agents.sh <studio-agents clone> [repo]   # copy and append
#   bash scripts/sync-agents.sh --check [repo]                 # agents match the notes? (CI, no network)
set -euo pipefail
CHECK=0; [[ ${1:-} == --check ]] && { CHECK=1; shift; }
if (( ! CHECK )); then SRC="${1:?usage: sync-agents.sh <studio-agents clone> [repo] | --check [repo]}/plugins/studio/agents"; shift; fi
REPO=$(cd "${1:-$(dirname "$0")/..}" && pwd)
NOTES=$REPO/docs/eng/AGENT-NOTES.md
AGENTS=${STUDIO_AGENTS:-staff-pm qa-tdd engineer privacy-security positioning ux-reviewer architect}
MARK="## Hearth notes"

section() {  # body of "## $1" in the notes file, without its heading, trimmed of blank edges
  awk -v h="## $1" '$0 == h {on=1; next} /^## / {on=0} on' "$NOTES" | sed -e '/./,$!d' | tac | sed -e '/./,$!d' | tac
}
block() {
  echo "$MARK"
  echo "_Built from \`docs/eng/AGENT-NOTES.md\` by \`scripts/sync-agents.sh\`. Edit the notes there, then re-run it; don't edit below this line._"
  echo
  section "Every agent"
  local own; own=$(section "$1")
  if [[ -n $own ]]; then echo; echo "$own"; fi
}

if (( CHECK )); then
  bad=0
  for a in $AGENTS; do
    f=$REPO/.claude/agents/$a.md
    if [[ ! -f $f ]] || ! grep -qxF "$MARK" "$f"; then echo "$a: no Hearth notes section (run scripts/sync-agents.sh)"; bad=1; continue; fi
    if ! diff -q <(sed -n "/^$MARK\$/,\$p" "$f") <(block "$a") >/dev/null; then
      echo "$a: Hearth notes differ from docs/eng/AGENT-NOTES.md (run scripts/sync-agents.sh)"; bad=1
    fi
  done
  (( bad == 0 )) && echo "Agent notes OK ($(wc -w <<< "$AGENTS" | tr -d ' ') studio agents)"
  exit $bad
fi

for a in $AGENTS; do [[ -f $SRC/$a.md ]] || { echo "unknown studio agent: $a (nothing copied)" >&2; exit 1; }; done
for a in $AGENTS; do
  { cat "$SRC/$a.md"; echo; block "$a"; } > "$REPO/.claude/agents/$a.md"
  echo "synced $a"
done
