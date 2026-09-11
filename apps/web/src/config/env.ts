import { z } from 'zod';

/**
 * Fail-fast frontend config (doc 04 section 5). Only ever put values here
 * that are safe to be public: every `VITE_*` variable ships inside the
 * bundle and is readable by anyone, build-time, not runtime.
 */
const schema = z.object({
  VITE_API_URL: z.string().url(),
  VITE_APP_ENV: z.enum(['development', 'staging', 'production']),
});

const parsed = schema.safeParse(import.meta.env);

if (!parsed.success) {
  // Fail at build/boot time, not the first time a user clicks something.
  throw new Error(
    `Invalid environment configuration:\n${JSON.stringify(parsed.error.format(), null, 2)}`,
  );
}

export const env = parsed.data;
