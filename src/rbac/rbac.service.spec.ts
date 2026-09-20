import { RbacService } from './rbac.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';

describe('RbacService accessForUser', () => {
  it('combines inherited and direct permissions without duplicates', async () => {
    const prisma = {
      userRole: { findMany: vi.fn().mockResolvedValue([{ role: { key: 'admin', permissions: [{ permission: { key: 'dashboard:read' } }, { permission: { key: 'roles:manage' } }] } }]) },
      userPermission: { findMany: vi.fn().mockResolvedValue([{ permission: { key: 'roles:manage' } }]) },
    } as unknown as PrismaService;
    const service = new RbacService(prisma, { get: vi.fn() } as unknown as ConfigService);

    await expect(service.accessForUser('user-1')).resolves.toEqual({ roles: ['admin'], permissions: ['dashboard:read', 'roles:manage'] });
  });

  it('does not bootstrap roles while looking up the default customer role', async () => {
    const prisma = {
      $transaction: vi.fn(),
      role: { findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 'role-user', key: 'user' }) },
    } as unknown as PrismaService;
    const service = new RbacService(prisma, { get: vi.fn() } as unknown as ConfigService);

    await expect(service.defaultUserRole()).resolves.toMatchObject({ id: 'role-user', key: 'user' });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('keeps existing role permission mappings unchanged during startup', async () => {
    const tx = {
      permission: {
        createMany: vi.fn(),
        findMany: vi.fn().mockResolvedValue([{ id: 'permission-dashboard', key: 'dashboard:read' }]),
      },
      role: {
        createMany: vi.fn().mockResolvedValue({ count: 0 }),
        findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 'role-user' }),
      },
      rolePermission: { createMany: vi.fn() },
      user: { findMany: vi.fn().mockResolvedValue([]) },
      userRole: { createMany: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
    };
    const prisma = { $transaction: vi.fn((callback) => callback(tx)) } as unknown as PrismaService;
    const service = new RbacService(prisma, { get: vi.fn(() => '') } as unknown as ConfigService);

    await service.ensureDefaults();

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.rolePermission.createMany).not.toHaveBeenCalled();
  });
});
