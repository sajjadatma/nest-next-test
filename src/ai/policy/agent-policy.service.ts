import { Injectable } from '@nestjs/common';
import { type StructuredIntent } from '../contracts/intent.contracts';
import { AGENT_TOOL_NAMES, type AgentToolName } from '../gateway/llm-provider.interface';

export type PolicyDecision =
  | { action: 'tool' }
  | { action: 'clarify' }
  | { action: 'handoff'; reason: 'HANDOFF_REQUIRED' | 'LOW_CONFIDENCE' | 'OUT_OF_SCOPE' };

@Injectable()
export class AgentPolicyService {
  decide(intent: StructuredIntent, text: string): PolicyDecision {
    if (this.requiresHandoff(text)) return { action: 'handoff', reason: 'HANDOFF_REQUIRED' };
    if (intent.intent === 'handoff') return { action: 'handoff', reason: 'HANDOFF_REQUIRED' };
    if (intent.confidence < 0.5) return { action: 'handoff', reason: 'LOW_CONFIDENCE' };
    if (intent.intent === 'other' || intent.missingInformation.length > 0) return { action: 'clarify' };
    return { action: 'tool' };
  }

  allowTool(name: string): name is AgentToolName {
    return (AGENT_TOOL_NAMES as readonly string[]).includes(name);
  }

  private requiresHandoff(text: string): boolean {
    return /refund|complaint|payment|angry|terrible|policy\s*exception|بازپرداخت|شکایت|پرداخت|عصبانی/u.test(text.toLocaleLowerCase('en-US'));
  }
}
