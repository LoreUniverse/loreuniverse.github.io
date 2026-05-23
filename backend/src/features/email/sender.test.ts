import { describe, it, expect } from 'vitest';
import { FakeEmailSender, createEmailSender } from './sender.js';

describe('FakeEmailSender', () => {
  it('records sent emails in memory', async () => {
    const sender = new FakeEmailSender();
    await sender.send({
      to: 'alice@example.com',
      subject: 'Verify your email',
      html: '<p>Link</p>',
      text: 'Link',
    });
    expect(sender.sent).toHaveLength(1);
    expect(sender.sent[0].to).toBe('alice@example.com');
    expect(sender.sent[0].subject).toBe('Verify your email');
  });

  it('clears the buffer', async () => {
    const sender = new FakeEmailSender();
    await sender.send({ to: 'a@b.com', subject: 's', html: 'h', text: 't' });
    sender.clear();
    expect(sender.sent).toHaveLength(0);
  });
});

describe('createEmailSender', () => {
  it('returns FakeEmailSender when NODE_ENV is test', () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';
    const sender = createEmailSender();
    expect(sender).toBeInstanceOf(FakeEmailSender);
    process.env.NODE_ENV = original;
  });
});
