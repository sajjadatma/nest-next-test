import { Body, Controller, Get, NotFoundException, Param, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiForbiddenResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { PermissionKey } from '../rbac/rbac.constants';
import { RequirePermissions } from '../rbac/require-permissions.decorator';
import { AssignRolesDto } from './dto/assign-roles.dto';
import { AssignPermissionsDto } from './dto/assign-permissions.dto';

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
