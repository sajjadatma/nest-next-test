import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  const strategy = new JwtStrategy({ getOrThrow: vi.fn(() => 'test-secret') } as unknown as ConfigService);

  it('accepts only a well-formed access-token payload', () => {
    expect(strategy.validate({ sub: 'user-1', email: 'user@example.com', type: 'access' })).toEqual({ id: 'user-1', email: 'user@example.com' });
  });

  it.each([
    { sub: 'user-1', email: 'user@example.com', type: 'refresh' },
    { sub: 'user-1', email: 'user@example.com' },
    { sub: '', email: 'user@example.com', type: 'access' },
    { sub: 'user-1', email: '', type: 'access' },
  ])('rejects a non-access or malformed token payload', (payload) => {
    expect(() => strategy.validate(payload)).toThrow(UnauthorizedException);
  });
});
