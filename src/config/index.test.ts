import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig, ConfigError } from './index';

describe('loadConfig', () => {
  const snapshot = { ...process.env };

  beforeEach(() => {
    // Start each test from a clean slate for the four config vars
    delete process.env.DATABASE_URL;
    delete process.env.PORT;
    delete process.env.NODE_ENV;
    delete process.env.LOG_LEVEL;
  });

  afterEach(() => {
    // Restore original env after each test
    process.env = snapshot;
  });

  it('returns a valid AppConfig when all required variables are set', () => {
    process.env.DATABASE_URL = 'postgresql://u:p@localhost:5432/test';
    process.env.PORT = '4000';
    process.env.NODE_ENV = 'development';
    process.env.LOG_LEVEL = 'debug';

    const config = loadConfig();

    expect(config.databaseUrl).toBe('postgresql://u:p@localhost:5432/test');
    expect(config.port).toBe(4000);
    expect(config.nodeEnv).toBe('development');
    expect(config.logLevel).toBe('debug');
  });

  it('defaults PORT to 3000 when not provided', () => {
    process.env.DATABASE_URL = 'postgresql://u:p@localhost:5432/test';
    process.env.NODE_ENV = 'development';
    process.env.LOG_LEVEL = 'info';

    const config = loadConfig();

    expect(config.port).toBe(3000);
  });

  it('defaults NODE_ENV to development when not provided', () => {
    process.env.DATABASE_URL = 'postgresql://u:p@localhost:5432/test';
    process.env.LOG_LEVEL = 'info';

    const config = loadConfig();

    expect(config.nodeEnv).toBe('development');
  });

  it('defaults LOG_LEVEL to info when not provided', () => {
    process.env.DATABASE_URL = 'postgresql://u:p@localhost:5432/test';
    process.env.NODE_ENV = 'development';

    const config = loadConfig();

    expect(config.logLevel).toBe('info');
  });

  it('throws ConfigError naming DATABASE_URL when it is missing', () => {
    process.env.NODE_ENV = 'development';

    expect(() => loadConfig()).toThrow(ConfigError);
    expect(() => loadConfig()).toThrow('DATABASE_URL');
  });

  it('throws ConfigError naming NODE_ENV when it has an invalid value', () => {
    process.env.DATABASE_URL = 'postgresql://u:p@localhost:5432/test';
    process.env.NODE_ENV = 'staging'; // not in the allowed enum

    expect(() => loadConfig()).toThrow(ConfigError);
    expect(() => loadConfig()).toThrow('NODE_ENV');
  });

  it('throws ConfigError naming LOG_LEVEL when it has an invalid value', () => {
    process.env.DATABASE_URL = 'postgresql://u:p@localhost:5432/test';
    process.env.NODE_ENV = 'development';
    process.env.LOG_LEVEL = 'verbose'; // not in the allowed enum

    expect(() => loadConfig()).toThrow(ConfigError);
    expect(() => loadConfig()).toThrow('LOG_LEVEL');
  });
});
