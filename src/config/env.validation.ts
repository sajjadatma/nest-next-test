import { z } from 'zod';

const boolean = z.enum(['true', 'false']).transform((value) => value === 'true');
const optionalUrl = z.preprocess((value) => value === '' ? undefined : value, z.string().url().optional());

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(5050),
  HOST: z.string().default('127.0.0.1'),
  DATABASE_URL: z.string().url().refine((value) => value.startsWith('postgresql://') || value.startsWith('postgres://'), 'DATABASE_URL must be a PostgreSQL connection URL'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must contain at least 32 characters'),
  FRONTEND_ORIGINS: z.string().default('http://127.0.0.1:3000,http://localhost:3000'),
  REDIS_URL: optionalUrl,
  REDIS_TLS: boolean.default(false),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  SENTRY_DSN: optionalUrl,
  RATE_LIMIT_TTL_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
  TRUST_PROXY: boolean.default(false),
  RESEND_API_KEY: z.string().optional(),
  ORDER_EMAIL_FROM: z.string().optional(),
  SHOP_PUBLIC_URL: optionalUrl,
}).superRefine((value, context) => {
  if (value.NODE_ENV === 'production' && value.FRONTEND_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean).length === 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['FRONTEND_ORIGINS'], message: 'FRONTEND_ORIGINS is required in production' });
  }
  if (value.NODE_ENV === 'production' && !value.RESEND_API_KEY) context.addIssue({ code: z.ZodIssueCode.custom, path: ['RESEND_API_KEY'], message: 'RESEND_API_KEY is required in production' });
  if (value.NODE_ENV === 'production' && !value.ORDER_EMAIL_FROM) context.addIssue({ code: z.ZodIssueCode.custom, path: ['ORDER_EMAIL_FROM'], message: 'ORDER_EMAIL_FROM is required in production' });
  if (value.NODE_ENV === 'production' && !value.SHOP_PUBLIC_URL) context.addIssue({ code: z.ZodIssueCode.custom, path: ['SHOP_PUBLIC_URL'], message: 'SHOP_PUBLIC_URL is required in production' });
});

export type Environment = z.infer<typeof schema>;

export function validateEnvironment(environment: Record<string, unknown>): Environment {
  const result = schema.safeParse(environment);
  if (result.success) return result.data;
  throw new Error(`Invalid environment configuration:\n${result.error.issues.map((issue) => `- ${issue.path.join('.')}: ${issue.message}`).join('\n')}`);
}
