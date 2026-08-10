import { IntentParserService } from './intent-parser.service';

describe('IntentParserService', () => {
  const parser = new IntentParserService();

  it.each([
    ['white size 42', { intent: 'refine_search', attributes: { color: 'white' }, size: '42', missingInformation: [] }],
    ['سفید سایز ۴۲', { intent: 'refine_search', attributes: { color: 'white' }, size: '42', missingInformation: [] }],
    ['the cheaper one', { intent: 'select_variant', missingInformation: [] }],
    ['compare second and third', { intent: 'compare', missingInformation: [] }],
  ])('parses %s deterministically', (fixture, expected) => {
    expect(parser.parse(fixture)).toMatchObject(expected);
  });

  it('keeps unresolved input partial and exposes deterministic reference hints outside StructuredIntent', () => {
    expect(parser.parse('please help')).toMatchObject({ intent: 'other', missingInformation: ['request'] });
    expect(parser.referenceHint('دومی و سومی را مقایسه کن')).toBe('second_and_third');
    expect(parser.referenceHint('the cheaper one')).toBe('cheaper');
  });
});
