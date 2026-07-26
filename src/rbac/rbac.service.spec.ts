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
});
