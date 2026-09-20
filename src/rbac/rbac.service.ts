import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionKey, RoleKey } from './rbac.constants';

@Injectable()
export class RbacService implements OnModuleInit {
  constructor(private prisma: PrismaService, private config: ConfigService) {}

  async onModuleInit() { await this.ensureDefaults(); }

  async ensureDefaults() {
    await this.prisma.$transaction((tx) => this.seedDefaults(tx));
  }

  private async seedDefaults(tx: Prisma.TransactionClient) {
    const definitions = [
      { key: PermissionKey.DashboardRead, name: 'Read dashboard', description: 'View dashboard data' },
      { key: PermissionKey.RolesManage, name: 'Manage roles', description: 'View users and assign roles' },
      { key: PermissionKey.SystemLogsRead, name: 'Read system logs', description: 'View sanitized system and security events' },
      { key: PermissionKey.ShopManage, name: 'Manage shop', description: 'Manage catalogue, inventory, and orders' },
      { key: PermissionKey.ShopCatalogManage, name: 'Manage shop catalogue', description: 'Create and edit shop products and categories' },
      { key: PermissionKey.ShopInventoryManage, name: 'Manage shop inventory', description: 'Adjust inventory and review inventory movements' },
      { key: PermissionKey.ShopOrdersRead, name: 'Read shop orders', description: 'View orders and customer fulfilment data' },
      { key: PermissionKey.ShopOrdersFulfill, name: 'Fulfil shop orders', description: 'Update order, shipment, and note operations' },
      { key: PermissionKey.ShopShippingManage, name: 'Manage shipping methods', description: 'Configure checkout shipping methods' },
      { key: PermissionKey.ShopPromotionsManage, name: 'Manage promotions', description: 'Create and edit promotion codes' },
      { key: PermissionKey.ShopCommentsModerate, name: 'Moderate shop comments', description: 'Review and moderate product comments' },
      { key: PermissionKey.ShopAnalyticsRead, name: 'Read shop analytics', description: 'View shop operational analytics' },
      { key: PermissionKey.ShopAuditRead, name: 'Read shop audit feed', description: 'View shop change history' },
      { key: PermissionKey.ShopB2bManage, name: 'Manage B2B companies', description: 'Manage B2B companies, memberships, and business access' },
    ];
    await tx.permission.createMany({ data: definitions, skipDuplicates: true });
    const permissions = await tx.permission.findMany({ where: { key: { in: definitions.map(({ key }) => key) } } });
    const byKey = new Map(permissions.map((permission) => [permission.key, permission.id]));
    const roleDefinitions = [
      { key: RoleKey.User, name: 'User', description: 'Standard customer access', permissionKeys: [] as string[] },
      { key: RoleKey.Staff, name: 'Staff', description: 'Internal dashboard access', permissionKeys: [PermissionKey.DashboardRead] },
      { key: RoleKey.Admin, name: 'Administrator', description: 'Full application access', permissionKeys: definitions.map(({ key }) => key) },
    ];
    for (const definition of roleDefinitions) {
      const { count: created } = await tx.role.createMany({ data: { key: definition.key, name: definition.name, description: definition.description }, skipDuplicates: true });
      if (!created) continue;
      const role = await tx.role.findUniqueOrThrow({ where: { key: definition.key }, select: { id: true } });
      const permissionIds = definition.permissionKeys.map((key) => byKey.get(key)).filter((id): id is string => Boolean(id));
      if (permissionIds.length) await tx.rolePermission.createMany({ data: permissionIds.map((permissionId) => ({ roleId: role.id, permissionId })), skipDuplicates: true });
    }
    const userRole = await tx.role.findUniqueOrThrow({ where: { key: RoleKey.User } });
    const usersWithoutRoles = await tx.user.findMany({ where: { roles: { none: {} } }, select: { id: true } });
    if (usersWithoutRoles.length) await tx.userRole.createMany({ data: usersWithoutRoles.map(({ id: userId }) => ({ userId, roleId: userRole.id })), skipDuplicates: true });
    const adminEmails = (this.config.get<string>('ADMIN_EMAILS') ?? '').split(',').map((email) => email.trim().toLowerCase()).filter(Boolean);
    if (adminEmails.length) {
      const adminRole = await tx.role.findUniqueOrThrow({ where: { key: RoleKey.Admin } });
      const admins = await tx.user.findMany({ where: { email: { in: adminEmails } }, select: { id: true } });
      const existing = await tx.userRole.findMany({ where: { roleId: adminRole.id, userId: { in: admins.map(({ id }) => id) } }, select: { userId: true } });
      const assigned = new Set(existing.map(({ userId }) => userId));
      const missing = admins.filter(({ id }) => !assigned.has(id));
      if (missing.length) await tx.userRole.createMany({ data: missing.map(({ id: userId }) => ({ userId, roleId: adminRole.id })), skipDuplicates: true });
    }
  }

  async defaultUserRole() { return this.prisma.role.findUniqueOrThrow({ where: { key: RoleKey.User } }); }

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
}
