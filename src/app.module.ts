import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { AuthModule } from './auth/auth.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { PrismaModule } from './prisma/prisma.module';
import { RbacModule } from './rbac/rbac.module';
import { AdminModule } from './admin/admin.module';
import { AppConfigModule } from './config/config.module';
import { HealthModule } from './health/health.module';
import { AuditModule } from './audit/audit.module';
import { SystemLogsModule } from './system-logs/system-logs.module';

@Module({
  imports: [
    AppConfigModule,
    SystemLogsModule,
    AuditModule,
    LoggerModule.forRoot({ pinoHttp: { level: process.env.LOG_LEVEL ?? 'info', genReqId: (request, response) => { const requestId = request.headers['x-request-id']?.toString() ?? randomUUID(); response.setHeader('x-request-id', requestId); return requestId; }, redact: ['req.headers.authorization', 'req.headers.cookie'], customProps: (request) => ({ requestId: request.id }) } }),
    ThrottlerModule.forRoot([{ ttl: Number(process.env.RATE_LIMIT_TTL_MS ?? 60_000), limit: Number(process.env.RATE_LIMIT_MAX ?? 100) }]),
    ServeStaticModule.forRoot({ rootPath: join(process.cwd(), 'public'), exclude: ['/api/{*path}'] }),
    PrismaModule,
    RbacModule,
    AuthModule,
    DashboardModule,
    AdminModule,
    HealthModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
