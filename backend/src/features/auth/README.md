# Auth feature

Owns the `users`, `sessions`, `accounts`, and `verifications` tables, and exposes Better Auth's HTTP routes at `/api/auth/*`.

## Implementation notes

- Better Auth is configured in `better-auth.ts`. Email verification is **required** before sign-in.
- Email is sent through the `EmailSender` interface in `../email/sender.ts`. Tests use `FakeEmailSender`; production uses `ResendEmailSender`. Local dev with no `RESEND_API_KEY` falls back to a console-log sender.
- Our user table has additional columns (`role`, `tier`, `is_banned`, `banned_at`, `banned_reason`) that Better Auth doesn't manage. These are declared via `additionalFields` in the Better Auth config.

## Endpoints exposed

- `POST /api/auth/sign-up/email` — create a new account; sends a verification email.
- `GET /api/auth/verify-email` — completes email verification (link from the email).
- `POST /api/auth/sign-in/email` — requires a verified email; returns a session cookie.
- `POST /api/auth/sign-out` — clears the session cookie. Requires `Origin` header (CSRF protection).
- `POST /api/auth/request-password-reset` — sends a reset email.
- `POST /api/auth/reset-password` — uses a token from the email to set a new password.
- `GET /api/auth/get-session` — returns the current user record if authenticated.

## First-admin bootstrap

The very first user (you) becomes an admin via a manual SQL update:

```sql
UPDATE users SET role = 'admin' WHERE email = 'you@whatever';
```

Run this against the Neon database after signing up and verifying your email.
