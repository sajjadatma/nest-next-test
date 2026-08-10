import { Module } from '@nestjs/common';
import { CommerceModule } from '../commerce/commerce.module';
import { ConversationModule } from '../conversations/conversation.module';
import { ReferenceStateService } from '../conversations/reference-state.service';
import { AgentService } from './agent.service';
import { FakeLlmProvider } from './gateway/fake-llm-provider';
import { LlmGatewayService } from './gateway/llm-gateway.service';
import { IntentParserService } from './intent-parser.service';
import { AgentPolicyService } from './policy/agent-policy.service';
import { ResponseValidatorService } from './validation/response-validator.service';

@Module({
  imports: [CommerceModule, ConversationModule],
  providers: [IntentParserService, ReferenceStateService, FakeLlmProvider, LlmGatewayService, AgentPolicyService, ResponseValidatorService, AgentService],
  exports: [IntentParserService, ReferenceStateService, LlmGatewayService, AgentPolicyService, ResponseValidatorService, AgentService],
})
export class AiModule {}
