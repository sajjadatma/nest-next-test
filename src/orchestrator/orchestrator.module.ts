import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { ConversationModule } from '../conversations/conversation.module';
import { HandoffService } from '../conversations/handoff.service';
import { DemandModule } from '../demand/demand.module';
import { ConversationController } from './conversation.controller';
import { OrchestratorService } from './orchestrator.service';

@Module({
  imports: [ConversationModule, AiModule, DemandModule],
  controllers: [ConversationController],
  providers: [OrchestratorService, HandoffService],
  exports: [OrchestratorService],
})
export class OrchestratorModule {}
