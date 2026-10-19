#!/usr/bin/env bash
# TDPM (CLAUDE.md rule 9, docs/product/PERSONA-CHECK.md): every product decision in docs/product/decisions/
# has one row per persona, each Green or Red with a short why, and every Red has a resolution line:
#   Resolution: <ID> mitigation: ...        or        Resolution: <ID> Chase override (<date>): ...
# Usage: check-persona-checks.sh [decisions_dir] [persona_file]   (defaults: the repo copies)
set -u
cd "$(dirname "$0")/.."
DIR=${1:-docs/product/decisions}
PERSONAS=${2:-docs/product/PERSONA-CHECK.md}

ids=$(awk '/<!-- personas:start -->/{on=1;next} /<!-- personas:end -->/{on=0} on && /^- [A-Z][A-Z]: /{print substr($2,1,2)}' "$PERSONAS")
[ -n "$ids" ] || { echo "$PERSONAS: no persona roster between <!-- personas:start --> and <!-- personas:end -->"; exit 1; }

shopt -s nullglob
files=("$DIR"/*.md)
[ ${#files[@]} -gt 0 ] || { echo "$DIR: no decision files"; exit 1; }

fail=0
for f in "${files[@]}"; do
  name=$(basename "$f")
  out=$(awk -v name="$name" -v ids="$ids" '
    function trim(s) { gsub(/^[ \t]+|[ \t]+$/, "", s); return s }
    BEGIN { n = split(ids, list, /[ \n]+/); for (i = 1; i <= n; i++) if (list[i] != "") known[list[i]] = 1 }
    /^\| *Persona *\| *Green\/Red *\| *Why *\|/ { table = 1; seen_table = 1; next }
    table && /^\|[-|: ]*$/ { next }
    table && /^\|/ {
      split($0, c, "|"); who = trim(c[2]); split(who, w, " "); id = w[1]
      val = trim(c[3]); why = trim(c[4])
      if (!(id in known)) { print name ": unknown persona \x27" id "\x27"; next }
      if (id in row) { print name ": " id " appears twice"; next }
      row[id] = val
      if (val != "Green" && val != "Red") print name ": " id " has \x27" val "\x27 (must be Green or Red)"
      words = split(why, ww, /[ \t]+/)
      if (why == "") print name ": " id " has no why"
      else if (words > 15) print name ": " id " why is " words " words (max 15)"
      next
    }
    table && !/^\|/ { table = 0 }
    /^Resolution: [A-Z][A-Z] (mitigation:|Chase override)/ { resolved[substr($2, 1, 2)] = 1 }
    END {
      if (!seen_table) { print name ": no \x27| Persona | Green/Red | Why |\x27 table"; exit }
      for (id in known) {
        if (!(id in row)) print name ": no row for " id
        else if (row[id] == "Red" && !(id in resolved)) print name ": " id " is Red with no \x27Resolution: " id " mitigation: ...\x27 or \x27Resolution: " id " Chase override (date): ...\x27 line"
      }
    }' "$f")
  if [ -n "$out" ]; then echo "$out"; fail=1; fi
done
[ $fail -eq 0 ] && echo "Persona checks OK (${#files[@]} decisions, $(echo $ids | wc -w) personas)"
exit $fail
