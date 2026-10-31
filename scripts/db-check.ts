import { getStore } from "../src/server/store";
async function main() {
  /** Read-only schema/connectivity probe, except idempotent CREATE TABLE initialization. */
  const result = await getStore().get("liveforge:connectivity-probe");
  console.log(
    JSON.stringify({
      databaseConfigured: Boolean(process.env.DATABASE_URL),
      connected: true,
      probePresent: Boolean(result),
    }),
  );
}
main().catch((error) => {
  console.error(
    JSON.stringify({
      error: error instanceof Error ? error.name : "Error",
      message: error instanceof Error ? error.message : "Probe failed",
    }),
  );
  process.exitCode = 1;
});
