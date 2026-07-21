import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { RbacService } from '../rbac/rbac.service';

describe('AuthService', () => {
  const jwt = { sign: vi.fn(() => 'signed-token') } as unknown as JwtService;
  const rbac = { defaultUserRole: vi.fn(), accessForUser: vi.fn() } as unknown as RbacService;
  const prisma = { user: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), findUniqueOrThrow: vi.fn() } } as unknown as PrismaService;
  const service = new AuthService(prisma, jwt, rbac);

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
});
