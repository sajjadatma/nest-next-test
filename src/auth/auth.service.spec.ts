import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { RbacService } from '../rbac/rbac.service';
import { AuditService } from '../audit/audit.service';
import { PasswordResetNotificationService } from './password-reset-notification.service';

describe('AuthService', () => {
  const jwt = { sign: vi.fn(() => 'signed-token') } as unknown as JwtService;
  const rbac = { defaultUserRole: vi.fn(), accessForUser: vi.fn() } as unknown as RbacService;
  const audit = { record: vi.fn() } as unknown as AuditService;
  const notifications = { sendPasswordReset: vi.fn().mockResolvedValue({ status: 'SENT' }) } as unknown as PasswordResetNotificationService;
  const prisma = {
    user: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), findUniqueOrThrow: vi.fn() },
    refreshToken: { create: vi.fn().mockResolvedValue({ id: 'refresh-1' }), updateMany: vi.fn() },
    passwordResetToken: { create: vi.fn(), updateMany: vi.fn(), findUniqueOrThrow: vi.fn() },
    $transaction: vi.fn(async (operation: ((tx: unknown) => unknown) | unknown[]) => Array.isArray(operation) ? Promise.all(operation) : operation(prisma)),
  } as unknown as PrismaService;
  const service = new AuthService(prisma, jwt, rbac, audit, notifications);

  beforeEach(() => vi.clearAllMocks());

  it('normalizes an email and assigns the default role when registering', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    vi.mocked(rbac.defaultUserRole).mockResolvedValue({ id: 'role-user' } as never);
    vi.mocked(prisma.user.create).mockResolvedValue({ id: 'user-1', email: 'jane@example.com', name: 'Jane', passwordHash: 'hash' } as never);

    await expect(service.register({ email: ' Jane@Example.COM ', password: 'password123', name: ' Jane ' })).resolves.toMatchObject({ accessToken: 'signed-token' });
    expect(prisma.user.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ email: 'jane@example.com', name: 'Jane', roles: { create: { roleId: 'role-user' } } }) }));
  });

  it('rejects duplicate registrations and invalid credentials', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({ id: 'existing' } as never);
    await expect(service.register({ email: 'jane@example.com', password: 'password123' })).rejects.toBeInstanceOf(ConflictException);

    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null);
    await expect(service.login({ email: 'jane@example.com', password: 'incorrect' })).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('requires the current password before changing it', async () => {
    const hash = await bcrypt.hash('password123', 4);
    vi.mocked(prisma.user.findUniqueOrThrow).mockResolvedValue({ passwordHash: hash } as never);
    await expect(service.changePassword('user-1', { currentPassword: 'wrong-pass', newPassword: 'new-password123' })).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('creates a single-use reset token, sends it by email, and never returns it', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'user-1', email: 'jane@example.com' } as never);
    vi.mocked(prisma.passwordResetToken.updateMany).mockResolvedValue({ count: 0 } as never);
    vi.mocked(prisma.passwordResetToken.create).mockResolvedValue({ id: 'reset-1' } as never);

    await expect(service.requestPasswordReset(' Jane@Example.com ')).resolves.toEqual({ message: 'If the account exists, a reset link will be sent.' });

    expect(prisma.passwordResetToken.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'user-1', usedAt: null } }));
    const created = vi.mocked(prisma.passwordResetToken.create).mock.calls[0][0];
    expect(created.data).toMatchObject({ userId: 'user-1' });
    expect(created.data.expiresAt.getTime()).toBeGreaterThan(Date.now() + 59 * 60 * 1000);
    expect(vi.mocked(notifications.sendPasswordReset)).toHaveBeenCalledWith('jane@example.com', expect.any(String));
  });

  it('returns the same reset response without creating a token for an unknown account', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

    await expect(service.requestPasswordReset('missing@example.com')).resolves.toEqual({ message: 'If the account exists, a reset link will be sent.' });
    expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
    expect(notifications.sendPasswordReset).not.toHaveBeenCalled();
  });

  it('uses a reset token once, changes the password, and revokes active sessions', async () => {
    vi.mocked(prisma.passwordResetToken.updateMany).mockResolvedValue({ count: 1 } as never);
    vi.mocked(prisma.passwordResetToken.findUniqueOrThrow).mockResolvedValue({ userId: 'user-1' } as never);
    vi.mocked(prisma.user.update).mockResolvedValue({ id: 'user-1' } as never);
    vi.mocked(prisma.refreshToken.updateMany).mockResolvedValue({ count: 2 } as never);

    await expect(service.resetPassword('valid-token', 'new-password123')).resolves.toEqual({ message: 'Password updated successfully' });

    expect(prisma.passwordResetToken.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ tokenHash: expect.any(String), usedAt: null, expiresAt: { gt: expect.any(Date) } }) }));
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'user-1', revokedAt: null } }));
    const update = vi.mocked(prisma.user.update).mock.calls[0][0];
    await expect(bcrypt.compare('new-password123', update.data.passwordHash)).resolves.toBe(true);
  });

  it('allows only one concurrent use of a reset token', async () => {
    let consumed = false;
    vi.mocked(prisma.passwordResetToken.updateMany).mockImplementation(async () => {
      if (consumed) return { count: 0 } as never;
      consumed = true;
      return { count: 1 } as never;
    });
    vi.mocked(prisma.passwordResetToken.findUniqueOrThrow).mockResolvedValue({ userId: 'user-1' } as never);
    vi.mocked(prisma.user.update).mockResolvedValue({ id: 'user-1' } as never);
    vi.mocked(prisma.refreshToken.updateMany).mockResolvedValue({ count: 1 } as never);

    const results = await Promise.allSettled([
      service.resetPassword('single-use-token', 'new-password123'),
      service.resetPassword('single-use-token', 'new-password123'),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((result) => result.status === 'rejected')?.reason).toBeInstanceOf(UnauthorizedException);
  });
});
