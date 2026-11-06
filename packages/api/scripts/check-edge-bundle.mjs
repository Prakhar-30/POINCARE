// Verifies the edge bundle is self-contained: no bare `import ... from "x"` left for Deno to
// resolve, and the three entry points the edge functions use are exported.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const file = path.resolve(here, "../../../frontend/supabase/functions/_shared/poincare.js");
const src = fs.readFileSync(file, "utf8");

const bare = [...src.matchAll(/^\s*import\s[^;]*?from\s+["']([^"'.][^"']*)["']/gm)].map((m) => m[1]);
if (bare.length) {
  console.error(`edge bundle still imports: ${[...new Set(bare)].join(", ")}`);
  process.exit(1);
}
for (const name of ["makeApi", "makeKeeper", "runKeeper"]) {
  if (!new RegExp(`export\\s*\\{[^}]*\\b${name}\\b`).test(src)) {
    console.error(`edge bundle does not export ${name}`);
    process.exit(1);
  }
}
console.log(`edge bundle ok: ${(src.length / 1024).toFixed(0)} KB, self-contained`);
