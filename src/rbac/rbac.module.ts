import { Global, Module } from '@nestjs/common';
import { PermissionsGuard } from './permissions.guard';
import { RbacService } from './rbac.service';

@Global()
@Module({ providers: [RbacService, PermissionsGuard], exports: [RbacService, PermissionsGuard] })
export class RbacModule {}
