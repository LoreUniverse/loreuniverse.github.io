import argon2 from 'argon2';
import { customAlphabet } from 'nanoid';
import { and, eq, isNull } from 'drizzle-orm';
import type { drizzle } from 'drizzle-orm/postgres-js';
import { schema } from '../../db/schema.js';

type Db = ReturnType<typeof drizzle<typeof schema>>;

const randomPart = customAlphabet('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 40);

const ALLOWED_ROLES = new Set(['admin', 'moderator']);

export type CreateInput = {
  userId: string;
  userRole: string;
  name: string;
  expiresAt?: Date;
};

export type CreateResult = {
  plaintext: string;
  record: typeof schema.apiTokens.$inferSelect;
};

export type ListedToken = {
  id: string;
  name: string;
  tokenPreview: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
};

export type TokenService = {
  create(input: CreateInput): Promise<CreateResult>;
  list(userId: string): Promise<ListedToken[]>;
  revoke(tokenId: string, userId: string): Promise<void>;
  validate(plaintext: string): Promise<{ userId: string; tokenId: string } | null>;
};

function prefixForRole(role: string): string {
  if (role === 'admin') return 'lore_admin_';
  if (role === 'moderator') return 'lore_moderator_';
  throw new Error(`Cannot mint token for role: ${role}`);
}

export function createTokenService(db: Db): TokenService {
  return {
    async create({ userId, userRole, name, expiresAt }) {
      if (!ALLOWED_ROLES.has(userRole)) {
        throw new Error(`Tokens can only be minted for admin or moderator roles; got ${userRole}`);
      }
      const rolePrefix = prefixForRole(userRole);
      const random = randomPart();
      const plaintext = `${rolePrefix}${random}`;
      const prefix = plaintext.slice(0, 20);
      const tokenHash = await argon2.hash(plaintext);

      const [record] = await db.insert(schema.apiTokens)
        .values({ userId, name, prefix, tokenHash, expiresAt: expiresAt ?? null })
        .returning();

      return { plaintext, record };
    },

    async list(userId) {
      const rows = await db.select().from(schema.apiTokens).where(eq(schema.apiTokens.userId, userId));
      return rows.map(r => ({
        id: r.id,
        name: r.name,
        tokenPreview: r.prefix,
        createdAt: r.createdAt,
        lastUsedAt: r.lastUsedAt,
        expiresAt: r.expiresAt,
        revokedAt: r.revokedAt,
      }));
    },

    async revoke(tokenId, userId) {
      await db.update(schema.apiTokens)
        .set({ revokedAt: new Date() })
        .where(and(eq(schema.apiTokens.id, tokenId), eq(schema.apiTokens.userId, userId)));
    },

    async validate(plaintext) {
      const candidatePrefix = plaintext.slice(0, 20);
      const now = new Date();
      const candidates = await db.select().from(schema.apiTokens)
        .where(and(
          isNull(schema.apiTokens.revokedAt),
          eq(schema.apiTokens.prefix, candidatePrefix),
        ));

      for (const row of candidates) {
        if (row.expiresAt && row.expiresAt < now) continue;
        const ok = await argon2.verify(row.tokenHash, plaintext);
        if (ok) {
          db.update(schema.apiTokens)
            .set({ lastUsedAt: now })
            .where(eq(schema.apiTokens.id, row.id))
            .catch(() => { /* ignore */ });
          return { userId: row.userId, tokenId: row.id };
        }
      }
      return null;
    },
  };
}
