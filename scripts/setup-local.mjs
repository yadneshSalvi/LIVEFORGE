import { randomBytes } from "node:crypto";
import { readFile, writeFile, chmod } from "node:fs/promises";
const path = new URL("../.env.local", import.meta.url);
let source = await readFile(path, "utf8").catch((error) => {
  if (error.code === "ENOENT")
    return "# Private LIVEFORGE local configuration\n";
  throw error;
});
const defaults = {
  APP_BASE_URL: () => "http://localhost:3100",
  SESSION_SECRET: () => randomBytes(48).toString("base64url"),
  TOKEN_ENCRYPTION_KEY: () => randomBytes(32).toString("base64"),
  CODEX_MODEL: () => "gpt-6.1-sol",
};
let changed = false;
for (const [name, create] of Object.entries(defaults)) {
  const pattern = new RegExp(`^${name}=([^\\r\\n]*)$`, "m");
  const existing = source.match(pattern);
  if (existing && existing[1].trim().replace(/^["']|["']$/g, "")) continue;
  const line = `${name}=${create()}`;
  source = existing
    ? source.replace(pattern, line)
    : source.trimEnd() + "\n" + line + "\n";
  changed = true;
}
if (changed) await writeFile(path, source, { mode: 0o600 });
await chmod(path, 0o600);
console.log(
  "Local setup is ready. Existing values were preserved; no secrets were printed. Run npm run dev.",
);
