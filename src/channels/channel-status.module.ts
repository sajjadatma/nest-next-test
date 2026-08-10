import { Module } from '@nestjs/common';
import { ChannelRegistryModule } from './channel-registry.module';
import { ChannelStatusController } from './channel-status.controller';
import { TelegramModule } from './telegram/telegram.module';

@Module({
  imports: [ChannelRegistryModule, TelegramModule],
  controllers: [ChannelStatusController],
})
export class ChannelStatusModule {}
