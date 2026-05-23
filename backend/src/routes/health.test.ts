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

  it('returns 200 with status ok and db module healthy', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.status).toBe('ok');
    expect(body.modules.db.status).toBe('ok');
    expect(typeof body.modules.db.latency_ms).toBe('number');
  });
});
