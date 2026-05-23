import { Resend } from 'resend';

export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}

export class FakeEmailSender implements EmailSender {
  public sent: EmailMessage[] = [];

  async send(message: EmailMessage): Promise<void> {
    this.sent.push({ ...message });
  }

  clear(): void {
    this.sent = [];
  }
}

export class ResendEmailSender implements EmailSender {
  private readonly client: Resend;
  private readonly from: string;

  constructor(apiKey: string, from: string) {
    this.client = new Resend(apiKey);
    this.from = from;
  }

  async send(message: EmailMessage): Promise<void> {
    const { error } = await this.client.emails.send({
      from: this.from,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
    });
    if (error) {
      throw new Error(`Resend send failed: ${error.message}`);
    }
  }
}

export function createEmailSender(): EmailSender {
  if (process.env.NODE_ENV === 'test') {
    return new FakeEmailSender();
  }
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || key.startsWith('replace-')) {
    return {
      async send(message) {
        console.log('[email:dev]', message.to, '-', message.subject, '\n', message.text);
      },
    };
  }
  if (!from) {
    throw new Error('EMAIL_FROM is required when RESEND_API_KEY is set');
  }
  return new ResendEmailSender(key, from);
}
