import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Environment } from './env.validation';

@Injectable()
export class RuntimeConfigService {
  constructor(private readonly config: ConfigService<Environment, true>) {}

  get port() { return this.config.getOrThrow('PORT', { infer: true }); }
  get host() { return this.config.getOrThrow('HOST', { infer: true }); }
  get nodeEnv() { return this.config.getOrThrow('NODE_ENV', { infer: true }); }
  get frontendOrigins() { return this.config.getOrThrow('FRONTEND_ORIGINS', { infer: true }).split(',').map((origin) => origin.trim()).filter(Boolean); }
  get sentryDsn() { return this.config.get('SENTRY_DSN', { infer: true }); }
}
