import { Injectable } from '@nestjs/common';
import { type StructuredIntent } from './contracts/intent.contracts';

export type ReferenceHint = 'second' | 'third' | 'cheaper' | 'second_and_third' | undefined;

@Injectable()
export class IntentParserService {
  parse(text: string): StructuredIntent {
    const normalized = this.normalize(text);
    const attributes: Record<string, string> = {};
    const color = this.color(normalized);
    if (color) attributes.color = color;
    const size = this.size(normalized);

    if (this.matches(normalized, ['compare', 'مقایسه'])) {
      return this.intent('compare', { attributes, size, confidence: 0.99 });
    }
    if (this.matches(normalized, ['cheaper', 'ارزان', 'ارزانتر', 'ارزان‌تر'])) {
      return this.intent('select_variant', { attributes, size, confidence: 0.98 });
    }
    if (this.matches(normalized, ['second', 'third', 'دومی', 'سومی', 'دوم', 'سوم'])) {
      return this.intent('select_variant', { attributes, size, confidence: 0.98 });
    }
    if (Object.keys(attributes).length > 0 || size) {
      return this.intent('refine_search', { attributes, size, confidence: 0.97 });
    }
    return this.intent('other', { confidence: 0.2, missingInformation: ['request'] });
  }

  referenceHint(text: string): ReferenceHint {
    const normalized = this.normalize(text);
    if (this.matches(normalized, ['compare second and third', 'مقایسه دوم و سوم', 'دومی و سومی'])) return 'second_and_third';
    if (this.matches(normalized, ['cheaper', 'ارزان', 'ارزانتر', 'ارزان‌تر'])) return 'cheaper';
    if (this.matches(normalized, ['third', 'سومی', 'سوم'])) return 'third';
    if (this.matches(normalized, ['second', 'دومی', 'دوم'])) return 'second';
    return undefined;
  }

  private intent(
    intent: StructuredIntent['intent'],
    options: Partial<Omit<StructuredIntent, 'intent'>>,
  ): StructuredIntent {
    const attributes = options.attributes && Object.keys(options.attributes).length > 0 ? options.attributes : undefined;
    return {
      intent,
      ...(attributes ? { attributes } : {}),
      ...(options.size ? { size: options.size } : {}),
      confidence: options.confidence ?? 0,
      missingInformation: options.missingInformation ?? [],
    };
  }

  private normalize(text: string): string {
    return text
      .trim()
      .toLocaleLowerCase('en-US')
      .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
      .replace(/ي/g, 'ی')
      .replace(/ك/g, 'ک');
  }

  private color(text: string): string | undefined {
    if (this.matches(text, ['white', 'سفید'])) return 'white';
    return undefined;
  }

  private size(text: string): string | undefined {
    const match = text.match(/(?:size|سایز)\s*(\d{1,3})\b/u);
    return match?.[1];
  }

  private matches(text: string, keywords: string[]): boolean {
    return keywords.some((keyword) => text.includes(keyword));
  }
}
