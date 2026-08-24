import { z } from 'zod';

export class ConfigError extends Error {
  constructor(field: string) {
    super(`Missing or invalid environment variable: ${field}`);
    this.name = 'ConfigError';
  }
}

export interface AppConfig {
  databaseUrl: string;
  port: number;
  nodeEnv: 'development' | 'test' | 'production';
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export function loadConfig(): AppConfig {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const firstIssue = result.error.issues[0];
    const field = String(firstIssue?.path[0] ?? 'unknown');
    throw new ConfigError(field);
  }

  const env = result.data;

  return {
    databaseUrl: env.DATABASE_URL,
    port: env.PORT,
    nodeEnv: env.NODE_ENV,
    logLevel: env.LOG_LEVEL,
  };
}
