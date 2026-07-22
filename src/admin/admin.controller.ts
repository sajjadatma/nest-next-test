import { Body, Controller, Get, NotFoundException, Param, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiForbiddenResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { PermissionKey } from '../rbac/rbac.constants';
import { RequirePermissions } from '../rbac/require-permissions.decorator';
import { AssignRolesDto } from './dto/assign-roles.dto';
import { AssignPermissionsDto } from './dto/assign-permissions.dto';
import { BulkAssignAccessDto } from './dto/bulk-assign-access.dto';

const roleSelect = { key: true, name: true, permissions: { select: { permission: { select: { key: true, name: true } } } } } as const;

@ApiTags('Administration')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions(PermissionKey.RolesManage)
@Controller('admin')
export class AdminController {
  constructor(private prisma: PrismaService) {}

  @Get('roles')
  @ApiOperation({ summary: 'List roles and their permissions' })
  @ApiOkResponse({ description: 'Role catalogue' })
  @ApiForbiddenResponse({ description: 'Requires roles:manage permission' })
  roles() { return this.prisma.role.findMany({ select: roleSelect, orderBy: { key: 'asc' } }); }

  @Get('users')
  @ApiOperation({ summary: 'List users and assigned roles' })
  users() { return this.prisma.user.findMany({ select: { id: true, email: true, name: true, roles: { select: { role: { select: { key: true, name: true } } } }, permissions: { select: { permission: { select: { key: true, name: true } } } } }, orderBy: { createdAt: 'desc' } }); }

  @Get('permissions')
  @ApiOperation({ summary: 'List permissions available for direct user grants' })
  permissions() { return this.prisma.permission.findMany({ select: { key: true, name: true, description: true }, orderBy: { key: 'asc' } }); }

  @Put('users/access')
  @ApiOperation({ summary: 'Replace roles and direct permissions for multiple users' })
  async assignAccess(@Body() dto: BulkAssignAccessDto) {
    const userIds = dto.assignments.map(({ userId }) => userId);
    const [users, roles, permissions] = await Promise.all([
      this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true } }),
      this.prisma.role.findMany({ where: { key: { in: [...new Set(dto.assignments.flatMap(({ roleKeys }) => roleKeys))] } }, select: { id: true, key: true } }),
      this.prisma.permission.findMany({ where: { key: { in: [...new Set(dto.assignments.flatMap(({ permissionKeys }) => permissionKeys))] } }, select: { id: true, key: true } }),
    ]);
    if (users.length !== userIds.length) throw new NotFoundException('One or more users do not exist');
    const roleIds = new Map(roles.map((role) => [role.key, role.id]));
    const permissionIds = new Map(permissions.map((permission) => [permission.key, permission.id]));
    if (dto.assignments.some(({ roleKeys }) => roleKeys.some((key) => !roleIds.has(key)))) throw new NotFoundException('One or more role keys do not exist');
    if (dto.assignments.some(({ permissionKeys }) => permissionKeys.some((key) => !permissionIds.has(key)))) throw new NotFoundException('One or more permission keys do not exist');
    await this.prisma.$transaction(async (tx) => {
      for (const assignment of dto.assignments) {
        await tx.userRole.deleteMany({ where: { userId: assignment.userId } });
        await tx.userRole.createMany({ data: assignment.roleKeys.map((key) => ({ userId: assignment.userId, roleId: roleIds.get(key)! })) });
        await tx.userPermission.deleteMany({ where: { userId: assignment.userId } });
        if (assignment.permissionKeys.length) await tx.userPermission.createMany({ data: assignment.permissionKeys.map((key) => ({ userId: assignment.userId, permissionId: permissionIds.get(key)! })) });
      }
    });
    return { updated: dto.assignments.length };
  }

  @Put('users/:id/roles')
  @ApiOperation({ summary: 'Replace a user’s role assignments' })
  async assignRoles(@Param('id') id: string, @Body() dto: AssignRolesDto) {
    const roles = await this.prisma.role.findMany({ where: { key: { in: dto.roleKeys } }, select: { id: true, key: true } });
    if (roles.length !== dto.roleKeys.length) throw new NotFoundException('One or more role keys do not exist');
    await this.prisma.userRole.deleteMany({ where: { userId: id } });
    await this.prisma.userRole.createMany({ data: roles.map((role) => ({ userId: id, roleId: role.id })) });
    return { id, roles: roles.map(({ key }) => key) };
  }

  @Put('users/:id/permissions')
  @ApiOperation({ summary: 'Replace direct user permission grants' })
  async assignPermissions(@Param('id') id: string, @Body() dto: AssignPermissionsDto) {
    const permissions = await this.prisma.permission.findMany({ where: { key: { in: dto.permissionKeys } }, select: { id: true, key: true } });
    if (permissions.length !== dto.permissionKeys.length) throw new NotFoundException('One or more permission keys do not exist');
    await this.prisma.userPermission.deleteMany({ where: { userId: id } });
    if (permissions.length) await this.prisma.userPermission.createMany({ data: permissions.map((permission) => ({ userId: id, permissionId: permission.id })) });
    return { id, permissions: permissions.map(({ key }) => key) };
  }
}
