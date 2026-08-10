import { Injectable } from '@nestjs/common';
import { FakeLlmProvider } from './fake-llm-provider';
import { type LlmChatRequest, type LlmProvider, type ProviderResponse } from './llm-provider.interface';

@Injectable()
export class LlmGatewayService {
  private readonly providers = new Map<string, LlmProvider>();
  private activeProvider: string;

  constructor(fakeProvider: FakeLlmProvider) {
    this.register(fakeProvider);
    this.activeProvider = fakeProvider.name;
  }

  register(provider: LlmProvider): void {
    this.providers.set(provider.name, provider);
  }

  use(providerName: string): void {
    if (!this.providers.has(providerName)) throw new Error(`LLM provider ${providerName} is not registered`);
    this.activeProvider = providerName;
  }

  completeChat(request: LlmChatRequest): Promise<ProviderResponse> {
    const provider = this.providers.get(this.activeProvider);
    if (!provider) throw new Error('No LLM provider is active');
    return provider.completeChat(request);
  }
}
