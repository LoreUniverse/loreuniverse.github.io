import type { drizzle } from 'drizzle-orm/postgres-js';
import { schema } from '../../db/schema.js';

type Db = ReturnType<typeof drizzle<typeof schema>>;

export type AuditEntry = {
  actorUserId: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
};

export type AuditService = {
  log(entry: AuditEntry): Promise<void>;
};

export function createAuditService(db: Db): AuditService {
  return {
    async log(entry) {
      await db.insert(schema.auditLog).values({
        actorUserId: entry.actorUserId,
        action: entry.action,
        targetType: entry.targetType ?? null,
        targetId: entry.targetId ?? null,
        metadata: entry.metadata ? JSON.stringify(entry.metadata) : null,
        ipAddress: entry.ipAddress ?? null,
        userAgent: entry.userAgent ?? null,
      });
    },
  };
}
