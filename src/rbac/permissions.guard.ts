import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../prisma/prisma.service';
import { PERMISSIONS_KEY } from './require-permissions.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector, private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext) {
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [context.getHandler(), context.getClass()]);
    if (!required?.length) return true;
    const request = context.switchToHttp().getRequest<{ user?: { id: string; roles?: string[]; permissions?: string[] } }>();
    if (!request.user) return false;
    const assignments = await this.prisma.userRole.findMany({
      where: { userId: request.user.id },
      select: { role: { select: { key: true, permissions: { select: { permission: { select: { key: true } } } } } } },
    });
    const roles = assignments.map(({ role }) => role.key);
    const permissions = [...new Set(assignments.flatMap(({ role }) => role.permissions.map(({ permission }) => permission.key)))];
    request.user.roles = roles;
    request.user.permissions = permissions;
    if (required.every((permission) => permissions.includes(permission))) return true;
    throw new ForbiddenException('You do not have permission to perform this action');
  }
}
