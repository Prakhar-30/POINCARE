// Copies the built SDK into the website (frontend/src/lib/poincare-sdk), so the app runs the very
// same DCA rules and regime logic as the SDK, MCP server and API, while the Vercel build stays
// self-contained inside frontend/. Run after `pnpm build`:  pnpm --dir packages/sdk sync:frontend
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(here, "../dist");
const dest = path.resolve(here, "../../../frontend/src/lib/poincare-sdk");
const banner = "// Generated from packages/sdk (pnpm --dir packages/sdk sync:frontend). Do not edit by hand.\n";

fs.mkdirSync(dest, { recursive: true });
for (const f of ["index.js", "index.d.ts"]) {
  const src = fs.readFileSync(path.join(dist, f), "utf8");
  fs.writeFileSync(path.join(dest, f), banner + src);
}
console.log(`synced SDK into ${path.relative(process.cwd(), dest)}`);
