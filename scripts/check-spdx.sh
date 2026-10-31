#!/usr/bin/env bash
# LIC-1/2 (DEC-44): every Hearth source file opens with the AGPL-3.0-or-later SPDX header.
# Usage: check-spdx.sh [dir ...]   (default: app/src, the edge functions, packages/messenger)
set -u
cd "$(dirname "$0")/.."
[ $# -gt 0 ] && roots=("$@") || roots=(app/src backend/supabase/functions packages/messenger/src packages/messenger/relay)
missing=0
while IFS= read -r f; do
  head -3 "$f" | grep -q 'SPDX-License-Identifier: AGPL-3.0-or-later' || { echo "$f: no AGPL-3.0-or-later SPDX header"; missing=$((missing+1)); }
done < <(find "${roots[@]}" -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.js' -o -name '*.mjs' \) -not -path '*/node_modules/*' 2>/dev/null | sort)
[ $missing -eq 0 ] && echo "SPDX check OK" || { echo "SPDX check: $missing file(s) missing the header"; exit 1; }
