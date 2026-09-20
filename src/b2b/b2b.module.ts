import { Module } from '@nestjs/common';
import { B2bCatalogController, B2bCompanyManagementController, B2bManagementController } from './b2b.controller';
import { AuditModule } from '../audit/audit.module';
import { B2bService } from './b2b.service';

@Module({ imports: [AuditModule], controllers: [B2bCatalogController, B2bManagementController, B2bCompanyManagementController], providers: [B2bService], exports: [B2bService] })
export class B2bModule {}
