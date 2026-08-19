import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RbacService } from './rbac.service';
import { ANY_PERMISSIONS_KEY, PERMISSIONS_KEY } from './require-permissions.decorator';
import { PermissionKey } from './rbac.constants';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector, private rbac: RbacService) {}

  async canActivate(context: ExecutionContext) {
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [context.getHandler(), context.getClass()]);
    const anyRequired = this.reflector.getAllAndOverride<string[]>(ANY_PERMISSIONS_KEY, [context.getHandler(), context.getClass()]);
    if (!required?.length && !anyRequired?.length) return true;
    const request = context.switchToHttp().getRequest<{ user?: { id: string; roles?: string[]; permissions?: string[] } }>();
    if (!request.user) return false;
    const { roles, permissions } = await this.rbac.accessForUser(request.user.id);
    request.user.roles = roles;
    request.user.permissions = permissions;
    // shop:manage remains a temporary super-permission so existing administrators
    // retain access while individual shop responsibilities are rolled out.
    const allSatisfied = !required?.length || required.every((permission) => permissions.includes(permission));
    const anySatisfied = !anyRequired?.length || anyRequired.some((permission) => permissions.includes(permission));
    const shopSuperPermission = permissions.includes(PermissionKey.ShopManage) && ([...(required ?? []), ...(anyRequired ?? [])].some((permission) => permission.startsWith('shop:')));
    if ((allSatisfied && anySatisfied) || shopSuperPermission) return true;
    throw new ForbiddenException('You do not have permission to perform this action');
  }
}
