import { execFileSync } from 'node:child_process';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { PrismaClient } from '@prisma/client';

describe('PostgreSQL database integration', () => {
  let container: StartedPostgreSqlContainer;
  let prisma: PrismaClient;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').withStartupTimeout(30_000).start();
    const databaseUrl = container.getConnectionUri();
    execFileSync('npx', ['prisma', 'migrate', 'deploy'], { cwd: process.cwd(), env: { ...process.env, DATABASE_URL: databaseUrl }, stdio: 'inherit' });
    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await container?.stop();
  });

  beforeEach(async () => {
    await prisma.userPermission.deleteMany();
    await prisma.userRole.deleteMany();
    await prisma.rolePermission.deleteMany();
    await prisma.user.deleteMany();
    await prisma.role.deleteMany();
    await prisma.permission.deleteMany();
  });

  it('enforces unique emails and cascading role assignments', async () => {
    const user = await prisma.user.create({ data: { email: 'db@example.com', passwordHash: 'hash' } });
    await expect(prisma.user.create({ data: { email: 'db@example.com', passwordHash: 'hash' } })).rejects.toMatchObject({ code: 'P2002' });
    const role = await prisma.role.create({ data: { key: 'user', name: 'User' } });
    await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });

    await prisma.user.delete({ where: { id: user.id } });
    await expect(prisma.userRole.count()).resolves.toBe(0);
  });

  it('keeps writes atomic when a transaction fails', async () => {
    await expect(prisma.$transaction(async (tx) => {
      await tx.user.create({ data: { email: 'rolled-back@example.com', passwordHash: 'hash' } });
      throw new Error('force rollback');
    })).rejects.toThrow('force rollback');
    await expect(prisma.user.findUnique({ where: { email: 'rolled-back@example.com' } })).resolves.toBeNull();
  });

  it('queries inherited and direct permissions with relational integrity', async () => {
    const [user, role, inherited, direct] = await Promise.all([
      prisma.user.create({ data: { email: 'permissions@example.com', passwordHash: 'hash' } }),
      prisma.role.create({ data: { key: 'manager', name: 'Manager' } }),
      prisma.permission.create({ data: { key: 'dashboard:read', name: 'Dashboard' } }),
      prisma.permission.create({ data: { key: 'roles:manage', name: 'Roles' } }),
    ]);
    await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: inherited.id } });
    await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
    await prisma.userPermission.create({ data: { userId: user.id, permissionId: direct.id } });

    const result = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, include: { roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } }, permissions: { include: { permission: true } } } });
    expect(result.roles[0].role.permissions[0].permission.key).toBe('dashboard:read');
    expect(result.permissions[0].permission.key).toBe('roles:manage');
  });
});
