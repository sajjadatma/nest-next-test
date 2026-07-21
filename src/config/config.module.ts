import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnvironment } from './env.validation';
import { RuntimeConfigService } from './runtime-config.service';

@Global()
@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, cache: true, validate: validateEnvironment })],
  providers: [RuntimeConfigService],
  exports: [RuntimeConfigService, ConfigModule],
})
export class AppConfigModule {}
