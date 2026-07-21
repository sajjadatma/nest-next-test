import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import cookieParser = require('cookie-parser');
import * as Sentry from '@sentry/nestjs';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { RuntimeConfigService } from './config/runtime-config.service';
import { HttpExceptionFilter } from './observability/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  const config = app.get(RuntimeConfigService);
  if (config.sentryDsn) Sentry.init({ dsn: config.sentryDsn, environment: config.nodeEnv });
  app.enableShutdownHooks();
  (app.getHttpAdapter().getInstance() as { set: (key: string, value: boolean) => void }).set('trust proxy', process.env.TRUST_PROXY === 'true');
  app.setGlobalPrefix('api');
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({ credentials: true, origin: (origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) => { if (!origin || config.frontendOrigins.includes(origin)) return callback(null, true); return callback(new Error('Origin is not allowed by CORS')); } });
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
  );
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Nest Prisma Dashboard API')
    .setDescription('Authentication and dashboard endpoints for the Nest Prisma Dashboard.')
    .setVersion('1.0.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document, {
    useGlobalPrefix: true,
    customSiteTitle: 'Nest Dashboard API Docs',
  });
  await app.listen(config.port, config.host);
  app.get(Logger).log(`Backend is ready: http://${config.host}:${config.port}`, 'Bootstrap');
}
bootstrap();
