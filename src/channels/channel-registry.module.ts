import { Module } from '@nestjs/common';
import { ChannelRegistryService } from './channel-registry.service';

@Module({
  providers: [ChannelRegistryService],
  exports: [ChannelRegistryService],
})
export class ChannelRegistryModule {}
