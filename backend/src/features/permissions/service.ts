import { and, eq } from 'drizzle-orm';
import type { drizzle } from 'drizzle-orm/postgres-js';
import { schema } from '../../db/schema.js';

type Db = ReturnType<typeof drizzle<typeof schema>>;

export type Role = 'user' | 'moderator' | 'admin';
const ROLE_RANK: Record<Role, number> = { user: 1, moderator: 2, admin: 3 };

export type PermissionsService = {
  hasRole(userId: string, minimum: Role): Promise<boolean>;
  hasPermission(userId: string, permission: string): Promise<boolean>;
  grant(input: { userId: string; permission: string; grantedBy: string }): Promise<void>;
  revoke(input: { userId: string; permission: string }): Promise<void>;
  listForUser(userId: string): Promise<string[]>;
};

async function getUserRole(db: Db, userId: string): Promise<Role | null> {
  const rows = await db.select({ role: schema.users.role, isBanned: schema.users.isBanned })
    .from(schema.users)
    .where(eq(schema.users.id, userId));
  if (rows.length === 0) return null;
  if (rows[0].isBanned) return null;
  const role = rows[0].role;
  if (role === 'user' || role === 'moderator' || role === 'admin') return role;
  return 'user';
}

export function createPermissionsService(db: Db): PermissionsService {
  return {
    async hasRole(userId, minimum) {
      const role = await getUserRole(db, userId);
      if (!role) return false;
      return ROLE_RANK[role] >= ROLE_RANK[minimum];
    },

    async hasPermission(userId, permission) {
      const role = await getUserRole(db, userId);
      if (!role) return false;
      if (role === 'moderator' || role === 'admin') return true;
      const rows = await db.select().from(schema.userPermissions)
        .where(and(
          eq(schema.userPermissions.userId, userId),
          eq(schema.userPermissions.permission, permission),
        ));
      return rows.length > 0;
    },

    async grant({ userId, permission, grantedBy }) {
      await db.insert(schema.userPermissions)
        .values({ userId, permission, grantedBy })
        .onConflictDoNothing();
    },

    async revoke({ userId, permission }) {
      await db.delete(schema.userPermissions)
        .where(and(
          eq(schema.userPermissions.userId, userId),
          eq(schema.userPermissions.permission, permission),
        ));
    },

    async listForUser(userId) {
      const rows = await db.select({ p: schema.userPermissions.permission })
        .from(schema.userPermissions)
        .where(eq(schema.userPermissions.userId, userId));
      return rows.map(r => r.p);
    },
  };
}
