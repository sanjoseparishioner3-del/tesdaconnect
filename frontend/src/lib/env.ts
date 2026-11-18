import { z } from 'zod';

const envSchema = z.object({
  VITE_APP_NAME: z.string().default('TCTESDAConnect'),
  VITE_SUPABASE_URL: z.string().url().optional().or(z.literal('')),
  VITE_SUPABASE_ANON_KEY: z.string().optional().or(z.literal('')),
  VITE_SUPABASE_PUBLISHABLE_KEY: z.string().optional().or(z.literal('')),
  VITE_SENTRY_DSN: z.string().optional().or(z.literal('')),
  VITE_SENTRY_ENVIRONMENT: z.string().default('development'),
  VITE_OFFLINE_MAX_TTL_HOURS: z.coerce.number().int().min(1).max(72).default(12),
  VITE_LEARNER_OFFLINE_TTL_HOURS: z.coerce.number().int().min(1).max(720).default(168),
});

const parsed = envSchema.safeParse(import.meta.env);

const parsedEnv = parsed.success
  ? parsed.data
  : {
      VITE_APP_NAME: 'TCTESDAConnect',
      VITE_SUPABASE_URL: '',
      VITE_SUPABASE_ANON_KEY: '',
      VITE_SUPABASE_PUBLISHABLE_KEY: '',
      VITE_SENTRY_DSN: '',
      VITE_SENTRY_ENVIRONMENT: 'development',
      VITE_OFFLINE_MAX_TTL_HOURS: 12,
      VITE_LEARNER_OFFLINE_TTL_HOURS: 168,
    };

/**
 * The browser API key. The new publishable key (sb_publishable_...) is preferred; the legacy
 * VITE_SUPABASE_ANON_KEY remains a fallback. Both are public by design (data is protected
 * by row level security), never put a secret / service_role key in any VITE_ variable.
 */
export const env = {
  ...parsedEnv,
  VITE_SUPABASE_ANON_KEY: parsedEnv.VITE_SUPABASE_PUBLISHABLE_KEY || parsedEnv.VITE_SUPABASE_ANON_KEY || '',
};

export const isSupabaseConfigured = Boolean(env.VITE_SUPABASE_URL && env.VITE_SUPABASE_ANON_KEY);
