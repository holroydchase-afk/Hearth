// Words like key, URL and caption inside strings are fine; only values are checked.
console.warn("no key or URL or caption here", 3);
try { x(); } catch (e) {
  console.error(`run failed (${e instanceof Error ? e.message.replace(/https?:\S+/g, "") : "error"})`);
  console.warn("screen error", e instanceof Error ? e.name : typeof e);
}
console.log(`notify: ${failed.length} batch(es) failed`);
