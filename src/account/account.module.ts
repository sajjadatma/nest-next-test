import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AccountController } from './account.controller';
import { AccountService } from './account.service';

@Module({ imports: [AuditModule], controllers: [AccountController], providers: [AccountService] })
export class AccountModule {}
