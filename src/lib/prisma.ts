import { PrismaClient } from '@prisma/client';
import config from '../config';
import logger from '../utils/logger';

// PrismaClient is attached to the `global` object in development to prevent
// exhausting your database connection limit.
const globalForPrisma = global as unknown as { prisma: PrismaClient };

function sanitizeDatabaseUrl(raw: string): string {
  try {
    const u = new URL(raw);
    if (u.password) u.password = "***";
    return u.toString();
  } catch {
    return "<invalid DATABASE_URL>";
  }
}

export const prisma = (() => {
  if (process.env.NODE_ENV === 'test' && process.env.TEST_TYPE === 'unit') {
    // Prefer a Jest-provided PrismaClient mock so service tests can assert on
    // model calls; fall back to a dependency-free mock for other unit tests.
    const MockedPrismaClient = PrismaClient as unknown as {
      new (): PrismaClient;
      _isMockFunction?: boolean;
    };
    if (typeof MockedPrismaClient === 'function' && MockedPrismaClient._isMockFunction) {
      return new MockedPrismaClient();
    }

    const mock: Partial<PrismaClient> = {
      idempotencyKey: {
        deleteMany: async () => ({ count: 0 }) as any,
        findUnique: async () => null as any,
        upsert: async () => null as any,
        create: async () => null as any,
        updateMany: async () => ({ count: 0 }) as any,
        // Add other model mocks if needed.
      },
      round: {
        findUnique: async () => null as any,
        findFirst: async () => null as any,
        count: async () => 0,
      },
      user: { count: async () => 0 },
      prediction: { count: async () => 0 },
      authChallenge: {
        deleteMany: async () => ({ count: 0 }) as any,
        count: async () => 0,
      },
      message: {
        deleteMany: async () => ({ count: 0 }) as any,
        count: async () => 0,
      },
      auditLog: {
        deleteMany: async () => ({ count: 0 }) as any,
        count: async () => 0,
      },
      // Add a generic $queryRaw mock for connectivity checks.
      $queryRaw: async () => null,
    } as any;
    return mock as PrismaClient;
  }

  // Production / development client.
  return globalForPrisma.prisma || new PrismaClient({
    datasources: {
      db: { url: config.database.url },
    },
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });
})();

if (!globalForPrisma.prisma) {
  logger.info("Prisma datasource configured", {
    databaseUrl: sanitizeDatabaseUrl(config.database.url),
    pool: {
      connectionLimit: config.database.connectionLimit,
      poolTimeoutSeconds: config.database.poolTimeoutSeconds,
      connectTimeoutSeconds: config.database.connectTimeoutSeconds,
      statementTimeoutMs: config.database.statementTimeoutMs,
      pgbouncer: config.database.pgbouncer,
    },
  });
}

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
