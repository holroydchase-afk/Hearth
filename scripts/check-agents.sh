#!/usr/bin/env bash
# Roster rule: every agent in .claude/agents/ is listed in CLAUDE.md's roster table, and vice versa.
set -u
cd "$(dirname "$0")/.."
fail=0
for f in .claude/agents/*.md; do
  name=$(basename "$f" .md)
  grep -q "^| \`$name\` |" CLAUDE.md || { echo "Agent '$name' is missing from the CLAUDE.md roster"; fail=1; }
done
for name in $(grep -o '^| `[a-z0-9-]*` |' CLAUDE.md | tr -d '|` '); do
  [ -f ".claude/agents/$name.md" ] || { echo "CLAUDE.md roster lists '$name' but .claude/agents/$name.md doesn't exist"; fail=1; }
done
[ $fail -eq 0 ] && echo "Agent roster OK ($(ls .claude/agents/*.md | wc -l) agents)"
exit $fail
