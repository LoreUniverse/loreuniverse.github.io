import 'dotenv/config';
import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import { createDb, closeDb } from '../../db/client.js';
import { createAuth } from './better-auth.js';
import { FakeEmailSender } from '../email/sender.js';

describe('Better Auth sign-up', () => {
  let app: FastifyInstance;
  let email: FakeEmailSender;
  const baseUrl = 'http://localhost:3000';
  const testEmail = `signup-${Date.now()}@example.com`;

  beforeAll(async () => {
    const url = process.env.DATABASE_URL_TEST!;
    const db = createDb(url);

    // Wipe accumulated test data from previous runs. CASCADE removes
    // dependent sessions/accounts/verifications automatically.
    await db.execute(sql`TRUNCATE TABLE users CASCADE`);

    email = new FakeEmailSender();
    const auth = createAuth({
      db,
      baseUrl,
      secret: 'test-secret-32-bytes-long-aaaaaaaa',
      emailSender: email,
    });

    app = Fastify();
    app.all('/api/auth/*', async (req, reply) => {
      const reqUrl = new URL(req.url, baseUrl);
      const headers = new Headers();
      for (const [k, v] of Object.entries(req.headers)) {
        if (Array.isArray(v)) headers.set(k, v.join(', '));
        else if (v) headers.set(k, String(v));
      }
      const body = ['GET', 'HEAD'].includes(req.method) ? undefined : JSON.stringify(req.body);
      const webReq = new Request(reqUrl, { method: req.method, headers, body });
      const webRes = await auth.handler(webReq);
      reply.status(webRes.status);

      const setCookies = typeof webRes.headers.getSetCookie === 'function'
        ? webRes.headers.getSetCookie()
        : [];
      if (setCookies.length > 0) reply.header('set-cookie', setCookies);

      webRes.headers.forEach((value, key) => {
        if (key.toLowerCase() === 'set-cookie') return;
        reply.header(key, value);
      });
      reply.send(await webRes.text());
    });
    await app.ready();
  });

  beforeEach(() => {
    email.clear();
  });

  afterAll(async () => {
    await app.close();
    await closeDb();
  });

  it('creates an unverified user and sends a verification email', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      payload: {
        email: testEmail,
        password: 'CorrectHorse-Battery-Staple-9',
        name: 'Test User',
      },
      headers: { 'content-type': 'application/json' },
    });

    expect(response.statusCode).toBe(200);
    expect(email.sent).toHaveLength(1);
    expect(email.sent[0].to).toBe(testEmail);
    expect(email.sent[0].subject).toMatch(/verify/i);
    expect(email.sent[0].text).toContain('http'); // contains a verification link
  });

  it('rejects sign-in for an unverified user', async () => {
    const unverifiedEmail = `unverified-${Date.now()}@example.com`;
    await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      payload: { email: unverifiedEmail, password: 'CorrectHorse-Battery-Staple-9', name: 'U' },
      headers: { 'content-type': 'application/json' },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
      payload: { email: unverifiedEmail, password: 'CorrectHorse-Battery-Staple-9' },
      headers: { 'content-type': 'application/json' },
    });

    expect(response.statusCode).toBeGreaterThanOrEqual(400);
  });

  it('allows sign-in for a verified user and sets a session cookie', async () => {
    const verifiedEmail = `verified-${Date.now()}@example.com`;

    // Sign up
    await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      payload: { email: verifiedEmail, password: 'CorrectHorse-Battery-Staple-9', name: 'V' },
      headers: { 'content-type': 'application/json' },
    });

    // Extract verification link from email
    const link = email.sent.at(-1)?.text.match(/https?:\/\/\S+/)?.[0];
    expect(link, 'verification link in email').toBeTruthy();

    // Hit the verification URL
    const verifyUrl = new URL(link!);
    const verifyResponse = await app.inject({
      method: 'GET',
      url: verifyUrl.pathname + verifyUrl.search,
    });
    expect(verifyResponse.statusCode).toBeLessThan(400);

    // Sign in
    const signInResponse = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
      payload: { email: verifiedEmail, password: 'CorrectHorse-Battery-Staple-9' },
      headers: { 'content-type': 'application/json' },
    });

    expect(signInResponse.statusCode).toBe(200);
    const setCookie = signInResponse.headers['set-cookie'];
    expect(setCookie).toBeTruthy();
    const cookieStr = Array.isArray(setCookie) ? setCookie.join(';') : String(setCookie);
    expect(cookieStr).toMatch(/session/i);
  });

  it('sends a password reset email and allows resetting', async () => {
    const resetEmail = `reset-${Date.now()}@example.com`;
    const originalPassword = 'CorrectHorse-Battery-Staple-9';
    const newPassword = 'A-Totally-Different-Password-42';

    // Sign up
    await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      payload: { email: resetEmail, password: originalPassword, name: 'R' },
      headers: { 'content-type': 'application/json' },
    });

    // Verify (so we can sign in later to check the password works)
    const verifyLink = email.sent.at(-1)?.text.match(/https?:\/\/\S+/)?.[0];
    const verifyUrl = new URL(verifyLink!);
    await app.inject({ method: 'GET', url: verifyUrl.pathname + verifyUrl.search });

    email.clear();

    // Request password reset — Better Auth exposes this at /request-password-reset
    const requestResp = await app.inject({
      method: 'POST',
      url: '/api/auth/request-password-reset',
      payload: { email: resetEmail, redirectTo: 'http://localhost:3000/reset' },
      headers: { 'content-type': 'application/json' },
    });
    expect(requestResp.statusCode).toBe(200);
    expect(email.sent).toHaveLength(1);
    expect(email.sent[0].subject).toMatch(/reset/i);

    // The reset URL is: baseURL/reset-password/TOKEN?callbackURL=...
    // Token is in the path (last segment before ?), not a query param.
    const resetLink = email.sent[0].text.match(/https?:\/\/\S+/)?.[0];
    expect(resetLink).toBeTruthy();
    const resetUrl = new URL(resetLink!);
    // Path: /reset-password/TOKEN — grab the last path segment
    const token = resetUrl.pathname.split('/').pop();
    expect(token, 'reset token in URL path').toBeTruthy();

    const resetResp = await app.inject({
      method: 'POST',
      url: '/api/auth/reset-password',
      payload: { token, newPassword },
      headers: { 'content-type': 'application/json' },
    });
    expect(resetResp.statusCode).toBe(200);

    // Sign in with new password
    const signInResp = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
      payload: { email: resetEmail, password: newPassword },
      headers: { 'content-type': 'application/json' },
    });
    expect(signInResp.statusCode).toBe(200);
  });

  it('signs out and clears the session cookie', async () => {
    const signOutEmail = `signout-${Date.now()}@example.com`;
    const password = 'CorrectHorse-Battery-Staple-9';

    // Sign up + verify
    await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      payload: { email: signOutEmail, password, name: 'S' },
      headers: { 'content-type': 'application/json' },
    });
    const link = email.sent.at(-1)?.text.match(/https?:\/\/\S+/)?.[0];
    const verifyUrl = new URL(link!);
    await app.inject({ method: 'GET', url: verifyUrl.pathname + verifyUrl.search });

    // Sign in and grab the cookie
    const signInResp = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
      payload: { email: signOutEmail, password },
      headers: { 'content-type': 'application/json' },
    });
    const setCookie = signInResp.headers['set-cookie'];
    const rawCookies = Array.isArray(setCookie) ? setCookie : [String(setCookie)];
    // Strip Set-Cookie attributes (HttpOnly, Path, SameSite, etc.) — keep only name=value pairs
    const cookieStr = rawCookies.map(c => c.split(';')[0]).join('; ');

    // Sign out using the cookie.
    // Better Auth enforces CSRF protection: when cookies are present it requires
    // the Origin header to match a trusted origin. No body/content-type needed.
    const signOutResp = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-out',
      headers: { cookie: cookieStr, origin: baseUrl },
    });
    expect(signOutResp.statusCode).toBe(200);

    // Confirm the response clears the session cookie
    const clearCookie = signOutResp.headers['set-cookie'];
    expect(clearCookie).toBeTruthy();
  });
});
