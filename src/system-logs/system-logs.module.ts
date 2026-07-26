import { Global, Module } from '@nestjs/common';
import { SystemLogsController } from './system-logs.controller';
import { SystemLogService } from './system-log.service';

@Global()
@Module({ controllers: [SystemLogsController], providers: [SystemLogService], exports: [SystemLogService] })
export class SystemLogsModule {}
