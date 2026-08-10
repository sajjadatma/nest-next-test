import { Module } from '@nestjs/common';
import { DemandAggregatesService } from './demand-aggregates.service';
import { DemandController } from './demand.controller';
import { DemandService } from './demand.service';

@Module({
  controllers: [DemandController],
  providers: [DemandService, DemandAggregatesService],
  exports: [DemandService, DemandAggregatesService],
})
export class DemandModule {}
