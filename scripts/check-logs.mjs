#!/usr/bin/env node
// PRIV-2 (CLAUDE.md rule 2: never log keys, URLs or captions). Static check of every console.* call in
// the app and the edge functions. Run by test-all.sh and CI; its own test is scripts/tests/check_logs_test.sh.
// Rules, applied to the call's arguments with string literals blanked (template ${...} parts are kept):
//   1. no variable or property whose name says key, secret, token, url/uri, caption, email, password,
//      kek, header, authorization or body
//   2. an error's .message only as .message.replace(/https?:\S+/g, ...), so a URL inside it is cut
//   3. no bare error object (e, err, error): it prints the message and stack unfiltered
//   4. no JSON.stringify: it dumps whatever the object holds
// Usage: node scripts/check-logs.mjs [file or dir ...]   (default: app/src backend/supabase/functions)
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOTS = process.argv.slice(2).length ? process.argv.slice(2) : ["app/src", "backend/supabase/functions"];
const SKIP = /(__tests__|\/test\/|\.test\.tsx?$|_test\.ts$|node_modules)/;
const SECRETISH = /\b[A-Za-z_$]*(key|secret|token|ur[li]|caption|email|password|kek|header|authorization|body)[A-Za-z_$]*\b/i;

function files(p) {
  if (statSync(p).isDirectory()) return readdirSync(p).flatMap((f) => files(join(p, f)));
  return /\.(ts|tsx|js|mjs)$/.test(p) && !SKIP.test(p) ? [p] : [];
}

// The argument text of a call that starts at `open` (the "("), or null if unbalanced.
function callArgs(src, open) {
  let depth = 0, q = null;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (q) { if (c === "\\") i++; else if (c === q) q = null; continue; }
    if (c === "'" || c === '"' || c === "`") q = c;
    else if (c === "(") depth++;
    else if (c === ")" && --depth === 0) return src.slice(open + 1, i);
  }
  return null;
}

// Blank out string literals; keep ${...} expressions inside template literals.
function code(args) {
  let out = "", i = 0;
  while (i < args.length) {
    const c = args[i];
    if (c === "'" || c === '"') {
      i++; while (i < args.length && args[i] !== c) { if (args[i] === "\\") i++; i++; } i++; out += '""';
    } else if (c === "`") {
      i++;
      while (i < args.length && args[i] !== "`") {
        if (args[i] === "\\") { i += 2; continue; }
        if (args[i] === "$" && args[i + 1] === "{") {
          let d = 1, j = i + 2;
          while (j < args.length && d) { if (args[j] === "{") d++; else if (args[j] === "}") d--; j++; }
          out += " " + args.slice(i + 2, j - 1) + " "; i = j; continue;
        }
        i++;
      }
      i++; out += '""';
    } else if (c === "/" && /[(,=:]\s*$/.test(out)) {   // regex literal
      i++; while (i < args.length && args[i] !== "/") { if (args[i] === "\\") i++; i++; } i++;
      while (/[a-z]/.test(args[i] ?? "")) i++; out += "/re/";
    } else { out += c; i++; }
  }
  return out;
}

const problems = [];
for (const root of ROOTS) {
  for (const f of files(root)) {
    const src = readFileSync(f, "utf8");
    const re = /console\.(log|info|warn|error|debug|trace)\s*\(/g;
    let m;
    while ((m = re.exec(src))) {
      const raw = callArgs(src, m.index + m[0].length - 1);
      if (raw === null) continue;
      const line = src.slice(0, m.index).split("\n").length;
      const where = `${relative(process.cwd(), f)}:${line}`;
      const c = code(raw);
      const name = c.match(SECRETISH);
      if (name) problems.push(`${where} logs "${name[0]}" (keys, URLs, captions, emails and bodies are never logged)`);
      if (/\.message\b(?!\.replace\(\/https\?:\\S\+\/g)/.test(raw)) problems.push(`${where} logs an error .message without cutting URLs (use .message.replace(/https?:\\S+/g, ""))`);
      if (/(^|[,(?:]\s*)(e|err|error)\s*($|[,)])/.test(c.trim()) || /\$\{\s*(e|err|error)\s*\}/.test(raw))
        problems.push(`${where} logs a whole error object (log e.name or a fixed word)`);
      if (/\b(e|err|error)\.(stack|cause)\b/.test(c)) problems.push(`${where} logs an error's stack or cause`);
      if (/JSON\.stringify/.test(c)) problems.push(`${where} logs JSON.stringify(...) (could dump anything)`);
    }
  }
}
if (problems.length) {
  console.log(problems.join("\n"));
  console.log(`PRIV-2 log check: ${problems.length} problem(s)`);
  process.exit(1);
}
console.log("PRIV-2 log check OK");
