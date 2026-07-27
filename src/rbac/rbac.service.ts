import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionKey, RoleKey } from './rbac.constants';

@Injectable()
export class RbacService implements OnModuleInit {
  constructor(private prisma: PrismaService, private config: ConfigService) {}

  async onModuleInit() { await this.ensureDefaults(); }

  async ensureDefaults() {
    const definitions = [
      { key: PermissionKey.DashboardRead, name: 'Read dashboard', description: 'View dashboard data' },
      { key: PermissionKey.RolesManage, name: 'Manage roles', description: 'View users and assign roles' },
      { key: PermissionKey.SystemLogsRead, name: 'Read system logs', description: 'View sanitized system and security events' },
      { key: PermissionKey.ShopManage, name: 'Manage shop', description: 'Manage catalogue, inventory, and orders' },
    ];
    for (const permission of definitions) await this.prisma.permission.upsert({ where: { key: permission.key }, update: { name: permission.name, description: permission.description }, create: permission });
    const permissions = await this.prisma.permission.findMany({ where: { key: { in: definitions.map(({ key }) => key) } } });
    const byKey = new Map(permissions.map((permission) => [permission.key, permission.id]));
    await this.upsertRole(RoleKey.User, 'User', 'Standard application access', [PermissionKey.DashboardRead].map((key) => byKey.get(key)!));
    await this.upsertRole(RoleKey.Admin, 'Administrator', 'Full application access', permissions.map(({ id }) => id));
    const userRole = await this.prisma.role.findUniqueOrThrow({ where: { key: RoleKey.User } });
    const usersWithoutRoles = await this.prisma.user.findMany({ where: { roles: { none: {} } }, select: { id: true } });
    if (usersWithoutRoles.length) await this.prisma.userRole.createMany({ data: usersWithoutRoles.map(({ id: userId }) => ({ userId, roleId: userRole.id })) });
    const adminEmails = (this.config.get<string>('ADMIN_EMAILS') ?? '').split(',').map((email) => email.trim().toLowerCase()).filter(Boolean);
    if (adminEmails.length) {
      const adminRole = await this.prisma.role.findUniqueOrThrow({ where: { key: RoleKey.Admin } });
      const admins = await this.prisma.user.findMany({ where: { email: { in: adminEmails } }, select: { id: true } });
      const existing = await this.prisma.userRole.findMany({ where: { roleId: adminRole.id, userId: { in: admins.map(({ id }) => id) } }, select: { userId: true } });
      const assigned = new Set(existing.map(({ userId }) => userId));
      const missing = admins.filter(({ id }) => !assigned.has(id));
      if (missing.length) await this.prisma.userRole.createMany({ data: missing.map(({ id: userId }) => ({ userId, roleId: adminRole.id })) });
    }
  }

  async defaultUserRole() { await this.ensureDefaults(); return this.prisma.role.findUniqueOrThrow({ where: { key: RoleKey.User } }); }

  async accessForUser(userId: string) {
    const [assignments, directPermissions] = await Promise.all([
      this.prisma.userRole.findMany({ where: { userId }, select: { role: { select: { key: true, permissions: { select: { permission: { select: { key: true } } } } } } } }),
      this.prisma.userPermission.findMany({ where: { userId }, select: { permission: { select: { key: true } } } }),
    ]);
    return {
      roles: assignments.map(({ role }) => role.key),
      permissions: [...new Set([...assignments.flatMap(({ role }) => role.permissions.map(({ permission }) => permission.key)), ...directPermissions.map(({ permission }) => permission.key)])],
    };
  }

  private async upsertRole(key: string, name: string, description: string, permissionIds: string[]) {
    const role = await this.prisma.role.upsert({ where: { key }, update: { name, description }, create: { key, name, description } });
    await this.prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await this.prisma.rolePermission.createMany({ data: permissionIds.map((permissionId) => ({ roleId: role.id, permissionId })) });
  }
}
