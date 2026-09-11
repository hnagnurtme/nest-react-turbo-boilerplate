/**
 * Node reads `.env` itself (20.12+), which keeps dotenv out of the dependency
 * list and, more importantly, loads the file before `validateEnv`/`getEnv`
 * runs. Shared by every standalone entrypoint (main.ts, migrate.ts, seed.ts,
 * openapi.ts) — each one calls this before touching config, since none of
 * them go through main.ts and none of them would otherwise see `.env` at all.
 */
export function loadEnvFile(): void {
  try {
    process.loadEnvFile?.();
  } catch {
    // No .env file: normal in container deployments where the env is injected.
  }
}
