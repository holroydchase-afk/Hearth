#!/usr/bin/env bash
# AGENTS-1: tests for scripts/sync-agents.sh. The studio agents come from studio-agents, and each one
# gets its Hearth section from docs/eng/AGENT-NOTES.md appended, so a re-sync never loses Hearth facts.
# Fixtures live in a temp dir; the real agents are only read by the last check.
set -u
cd "$(dirname "$0")/../.."
pass=0; fail=0
ok()  { echo "ok      $1"; pass=$((pass+1)); }
bad() { echo "NOT OK  $1"; fail=$((fail+1)); }
check() { if (eval "$2"); then ok "$1"; else bad "$1"; fi; }
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT

S=$T/studio/plugins/studio/agents; R=$T/repo
mkdir -p "$S" "$R/.claude/agents" "$R/docs/eng"
printf -- '---\nname: alpha\n---\nAlpha body.\n' > "$S/alpha.md"
printf -- '---\nname: beta\n---\nBeta body.\n' > "$S/beta.md"
printf -- '---\nname: gamma\n---\nGamma body.\n' > "$S/gamma.md"
printf -- '---\nname: local\n---\nOur own.\n' > "$R/.claude/agents/local.md"
cat > "$R/docs/eng/AGENT-NOTES.md" <<'N'
# Agent notes

Intro text that no agent gets.

## Every agent
- Say hello first.

## alpha
- Alpha fact one.
- Alpha fact two.

## beta
- Beta fact.

## Retired Hearth agents
Not an agent.
N
run() { out=$(STUDIO_AGENTS="${AGENTS:-alpha beta}" bash scripts/sync-agents.sh "$@" 2>&1); rc=$?; }

run "$T/studio" "$R"
check "AGENTS-1 sync succeeds" '(( rc == 0 ))' || echo "$out"
check "AGENTS-1 the studio text comes first, unchanged" 'head -4 "$R/.claude/agents/alpha.md" | cmp -s - "$S/alpha.md"'
check "AGENTS-1 each agent gets its own section plus the every-agent section" \
  'grep -q "Alpha fact two" "$R/.claude/agents/alpha.md" && grep -q "Say hello first" "$R/.claude/agents/alpha.md" && ! grep -q "Beta fact" "$R/.claude/agents/alpha.md"'
check "AGENTS-1 no other section leaks in" '! grep -q "Not an agent\|Intro text" "$R/.claude/agents/alpha.md" "$R/.claude/agents/beta.md"'
check "AGENTS-1 only listed agents are synced; project agents are left alone" \
  '[[ ! -e $R/.claude/agents/gamma.md ]] && grep -q "Our own" "$R/.claude/agents/local.md" && ! grep -q "Hearth notes" "$R/.claude/agents/local.md"'
cp "$R/.claude/agents/alpha.md" "$T/first"
run "$T/studio" "$R"
check "AGENTS-1 running it twice changes nothing" 'cmp -s "$T/first" "$R/.claude/agents/alpha.md" && (( $(grep -c "## Hearth notes" "$R/.claude/agents/alpha.md") == 1 ))'

run --check "$R"
check "AGENTS-2 --check passes when the agents match the notes" '(( rc == 0 ))' || echo "$out"
sed -i 's/Alpha fact one./Alpha fact one, edited./' "$R/docs/eng/AGENT-NOTES.md"
run --check "$R"
check "AGENTS-2 --check fails when the notes changed but the agent wasn't re-synced" '(( rc != 0 )) && [[ $out == *alpha* ]]'
run "$T/studio" "$R"; run --check "$R"
check "AGENTS-2 a re-sync fixes it" '(( rc == 0 ))'
printf -- '---\nname: beta\n---\nHand edit.\n' > "$R/.claude/agents/beta.md"
run --check "$R"
check "AGENTS-2 --check fails when an agent lost its Hearth section" '(( rc != 0 )) && [[ $out == *beta* ]]'
AGENTS="alpha nope" run "$T/studio" "$R"
check "AGENTS-3 an unknown agent copies nothing and says which" '(( rc != 0 )) && [[ $out == *nope* ]]'

out=$(bash scripts/sync-agents.sh --check 2>&1); rc=$?
check "AGENTS-2 the real agents match docs/eng/AGENT-NOTES.md" '(( rc == 0 ))' || echo "$out"

echo "SYNC AGENTS RESULT: $pass passed, $fail failed"
[ $fail -eq 0 ]
