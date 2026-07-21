import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../prisma/prisma.service';
import { RbacService } from './rbac.service';
import { PERMISSIONS_KEY } from './require-permissions.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector, private rbac: RbacService) {}

  async canActivate(context: ExecutionContext) {
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [context.getHandler(), context.getClass()]);
    if (!required?.length) return true;
    const request = context.switchToHttp().getRequest<{ user?: { id: string; roles?: string[]; permissions?: string[] } }>();
    if (!request.user) return false;
    const { roles, permissions } = await this.rbac.accessForUser(request.user.id);
    request.user.roles = roles;
    request.user.permissions = permissions;
    if (required.every((permission) => permissions.includes(permission))) return true;
    throw new ForbiddenException('You do not have permission to perform this action');
  }
}
