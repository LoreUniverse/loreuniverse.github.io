import { describe, it, expect } from 'vitest';
import { withRetry } from './retry.js';

describe('withRetry', () => {
  it('returns the value when the operation succeeds first try', async () => {
    let calls = 0;
    const result = await withRetry(async () => { calls++; return 42; }, { attempts: 3, baseDelayMs: 1 });
    expect(result).toBe(42);
    expect(calls).toBe(1);
  });

  it('retries on failure and eventually succeeds', async () => {
    let calls = 0;
    const result = await withRetry(async () => {
      calls++;
      if (calls < 3) throw new Error('fail');
      return 'ok';
    }, { attempts: 5, baseDelayMs: 1 });
    expect(result).toBe('ok');
    expect(calls).toBe(3);
  });

  it('throws after exhausting attempts', async () => {
    let calls = 0;
    await expect(
      withRetry(async () => { calls++; throw new Error('always fails'); }, { attempts: 2, baseDelayMs: 1 })
    ).rejects.toThrow(/always fails/);
    expect(calls).toBe(2);
  });
});
