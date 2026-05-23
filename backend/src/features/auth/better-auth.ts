import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import type { drizzle } from 'drizzle-orm/postgres-js';
import { schema } from '../../db/schema.js';
import { createEmailSender, type EmailSender } from '../email/sender.js';

type Db = ReturnType<typeof drizzle<typeof schema>>;

export type AuthConfig = {
  db: Db;
  baseUrl: string;
  secret: string;
  emailSender?: EmailSender;
};

export function createAuth(config: AuthConfig) {
  const sender = config.emailSender ?? createEmailSender();
  const isSecure = config.baseUrl.startsWith('https://');

  return betterAuth({
    database: drizzleAdapter(config.db, {
      provider: 'pg',
      schema: {
        user: schema.users as any,
        session: schema.sessions as any,
        account: schema.accounts as any,
        verification: schema.verifications as any,
      },
    }),
    baseURL: config.baseUrl,
    secret: config.secret,
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      autoSignIn: false,
      sendResetPassword: async ({ user, url }) => {
        await sender.send({
          to: user.email,
          subject: 'Reset your Lore Universe password',
          html: `<p>Hi ${user.name ?? ''},</p>
            <p>Click <a href="${url}">this link</a> to reset your password.</p>
            <p>If you didn't request this, you can ignore this email.</p>`,
          text: `Hi ${user.name ?? ''},

Click the following link to reset your password:
${url}

If you didn't request this, you can ignore this email.`,
        });
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) => {
        await sender.send({
          to: user.email,
          subject: 'Verify your Lore Universe account',
          html: `<p>Welcome to Lore Universe, ${user.name ?? ''}!</p>
            <p>Verify your email by clicking <a href="${url}">this link</a>.</p>`,
          text: `Welcome to Lore Universe, ${user.name ?? ''}!

Verify your email by visiting this link:
${url}`,
        });
      },
    },
    user: {
      additionalFields: {
        role: { type: 'string', defaultValue: 'user', input: false },
        tier: { type: 'string', defaultValue: 'free', input: false },
        isBanned: { type: 'boolean', defaultValue: false, input: false, fieldName: 'isBanned' },
        bannedAt: { type: 'date', required: false, input: false, fieldName: 'bannedAt' },
        bannedReason: { type: 'string', required: false, input: false, fieldName: 'bannedReason' },
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
    },
    ...(isSecure
      ? {
          advanced: {
            defaultCookieAttributes: {
              sameSite: 'none' as 'none',
              secure: true,
            },
          },
        }
      : {}),
    trustedOrigins: (process.env.ALLOWED_ORIGINS ?? '').split(',').filter(Boolean),
  });
}

export type AuthInstance = ReturnType<typeof createAuth>;
