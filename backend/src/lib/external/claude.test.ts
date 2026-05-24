import { describe, it, expect } from 'vitest';
import { FakeClaudeClient, type WikiIndex } from './claude.js';

describe('FakeClaudeClient', () => {
  it('records calls and returns the canned response', async () => {
    const fake = new FakeClaudeClient({ annotatedText: '{characters|aldren|Aldren} walked.' });
    const wiki: WikiIndex = [{ category: 'characters', slug: 'aldren', name: 'Aldren', aliases: [] }];

    const result = await fake.annotateChapter({
      chapterText: 'Aldren walked.',
      wikiIndex: wiki,
      policy: 'first-mention-per-section',
    });

    expect(result.annotatedText).toBe('{characters|aldren|Aldren} walked.');
    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0].chapterText).toBe('Aldren walked.');
  });
});
