import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerHealthRoute } from './health.js';
import { createDb, closeDb } from '../db/client.js';

describe('GET /health', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const url = process.env.DATABASE_URL_TEST!;
    const db = createDb(url);
    app = Fastify();
    app.decorate('db', db);
    await registerHealthRoute(app);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await closeDb();
  });

  it('reports overall ok with healthy DB', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.status).toBe('ok');
    expect(body.modules.db.status).toBe('ok');
  });

  it('includes all foundation feature modules in the modules object', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' });
    const body = response.json();
    expect(body.modules).toHaveProperty('db');
    expect(body.modules).toHaveProperty('auth');
    expect(body.modules).toHaveProperty('audit');
    expect(body.modules).toHaveProperty('permissions');
    expect(body.modules).toHaveProperty('tokens');
  });
});
