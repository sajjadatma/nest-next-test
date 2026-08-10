import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChannelRegistryModule } from '../channel-registry.module';
import { ChannelRegistryService } from '../channel-registry.service';
import { AppConfigModule } from '../../config/config.module';
import { OrchestratorModule } from '../../orchestrator/orchestrator.module';
import { FakeTelegramClient } from './fake-telegram-client';
import { TelegramAdapter } from './telegram.adapter';
import { TELEGRAM_CLIENT, HttpTelegramClient, type TelegramClient } from './telegram-client.port';
import { TelegramController } from './telegram.controller';

@Module({
  imports: [AppConfigModule, ChannelRegistryModule, OrchestratorModule],
  controllers: [TelegramController],
  providers: [
    {
      provide: TELEGRAM_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService): TelegramClient => {
        const token = config.get<string>('TELEGRAM_BOT_TOKEN');
        return token ? new HttpTelegramClient(token) : new FakeTelegramClient();
      },
    },
    {
      provide: TelegramAdapter,
      inject: [TELEGRAM_CLIENT, ConfigService],
      useFactory: (client: TelegramClient, config: ConfigService) => new TelegramAdapter(
        client,
        config.get<string>('TELEGRAM_WEBHOOK_SECRET'),
        config.get<string>('SHOP_PUBLIC_URL'),
      ),
    },
    {
      provide: 'TELEGRAM_ADAPTER_REGISTRATION',
      inject: [ChannelRegistryService, TelegramAdapter],
      useFactory: (registry: ChannelRegistryService, adapter: TelegramAdapter) => {
        registry.register(adapter);
        return true;
      },
    },
  ],
  exports: [TelegramAdapter, TELEGRAM_CLIENT],
})
export class TelegramModule {}
