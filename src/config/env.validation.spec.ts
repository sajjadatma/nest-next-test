import { validateEnvironment } from './env.validation';

const valid = {
  DATABASE_URL: 'postgresql://dashboard:dashboard@localhost:5432/dashboard',
  JWT_SECRET: 'a-secure-jwt-secret-with-more-than-32-chars',
};

describe('environment validation', () => {
  it('accepts PostgreSQL configuration and applies safe defaults', () => {
    expect(validateEnvironment(valid)).toMatchObject({ NODE_ENV: 'development', PORT: 5050, FRONTEND_ORIGINS: 'http://127.0.0.1:3000,http://localhost:3000' });
  });

  it.each([
    [{ ...valid, DATABASE_URL: 'file:./dev.db' }],
    [{ ...valid, JWT_SECRET: 'too-short' }],
    [{ ...valid, REDIS_URL: 'not-a-url' }],
  ])('rejects unsafe configuration', (environment) => {
    expect(() => validateEnvironment(environment)).toThrow('Invalid environment configuration');
  });
});
