import { z } from "zod";

const boolish = z
  .enum(["true", "false", "1", "0", ""])
  .optional()
  .transform((v) => v === "true" || v === "1");

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url(),
  APP_URL: z.string().url(),
  BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET must be at least 32 characters"),
  // 32 random bytes, base64-encoded. Encrypts Meta access tokens at rest.
  TOKEN_ENCRYPTION_KEY: z
    .string()
    .refine((v) => Buffer.from(v, "base64").length === 32, "TOKEN_ENCRYPTION_KEY must be 32 bytes, base64-encoded"),
  CRON_SECRET: z.string().min(32, "CRON_SECRET must be at least 32 characters"),

  META_APP_ID: z.string().optional().default(""),
  META_APP_SECRET: z.string().optional().default(""),
  META_API_VERSION: z
    .string()
    .regex(/^v\d+\.\d+$/, "META_API_VERSION must look like v24.0")
    .default("v24.0"),
  // Overridable only so automated tests can point at a local mock Graph API.
  META_GRAPH_BASE_URL: z.string().url().default("https://graph.facebook.com"),
  META_OAUTH_BASE_URL: z.string().url().default("https://www.facebook.com"),
  // Optional: Facebook Login for Business configuration id (used instead of a scope list).
  META_LOGIN_CONFIG_ID: z.string().optional(),

  DEMO_MODE: boolish,

  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_SECURE: boolish,
  EMAIL_FROM: z.string().default("Suroskie Portal <no-reply@example.com>"),

  WORKER_TIME_BUDGET_MS: z.coerce.number().int().positive().default(240_000),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

/** Validated server environment. Throws a readable error listing every invalid variable. */
export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  if (parsed.data.NODE_ENV === "production" && parsed.data.DEMO_MODE) {
    console.warn("[env] DEMO_MODE is enabled in production — only synthetic demo data will be shown.");
  }
  cached = parsed.data;
  return cached;
}

export function metaAppConfigured(): boolean {
  const e = env();
  return Boolean(e.META_APP_ID && e.META_APP_SECRET);
}

/** Test hook: forget the cached env so tests can change process.env. */
export function resetEnvCache() {
  cached = null;
}
