import { describe, it, expect } from 'vitest';
import { FakeGitHubDispatchClient } from './github-dispatch.js';

describe('FakeGitHubDispatchClient', () => {
  it('records events without making network calls', async () => {
    const client = new FakeGitHubDispatchClient();
    await client.triggerEvent({ eventType: 'wiki-content-changed', clientPayload: { slug: 'aldren' } });
    expect(client.events).toHaveLength(1);
    expect(client.events[0].eventType).toBe('wiki-content-changed');
    expect(client.events[0].clientPayload).toEqual({ slug: 'aldren' });
  });
});
