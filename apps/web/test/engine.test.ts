import { describe, it, expect } from 'vitest';
import { getHandler } from '../src/lib/ai/handlers';

describe('Handler Registry & Engine Safety', () => {
  it('registers all initial required step handlers', () => {
    const requiredHandlers = [
      'GENERATE_TEXT',
      'DRAFT_EMAIL',
      'SUMMARIZE_DOCUMENT',
      'EXTRACT_INFORMATION',
      'ANALYZE_IMAGE',
      'GENERATE_CHECKLIST',
      'COMPARE_INFORMATION',
      'CREATE_REPORT',
      'PRODUCE_PLAN',
      'REQUEST_USER_INPUT',
      'REQUEST_APPROVAL',
      'MARK_COMPLETE',
      'VERIFY_ARTIFACT',
    ];

    for (const type of requiredHandlers) {
      const handler = getHandler(type);
      expect(handler, `Expected handler for ${type} to be defined`).toBeDefined();
    }
  });

  it('rejects unknown step handler safely without code execution', () => {
    const handler = getHandler('ARBITRARY_UNSAFE_HANDLER');
    expect(handler).toBeUndefined();
  });
});
