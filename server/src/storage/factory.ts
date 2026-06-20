/**
 * Build the configured Repository. Keeps Postgres lazily imported so SQLite /
 * memory deployments don't need the `pg` driver loaded.
 */
import type { Repository } from './types.ts';
import { InMemoryRepository } from './memory.ts';
import { SqliteRepository } from './sqlite.ts';

export type DbKind = 'memory' | 'sqlite' | 'postgres';

export interface DbConfig {
  kind: DbKind;
  /** SQLite file path (or ':memory:'). Used when kind === 'sqlite'. */
  sqlitePath?: string;
  /** Postgres connection string. Used when kind === 'postgres'. */
  postgresUrl?: string;
}

export async function createRepository(config: DbConfig): Promise<Repository> {
  switch (config.kind) {
    case 'memory':
      return new InMemoryRepository();
    case 'sqlite':
      return new SqliteRepository(config.sqlitePath ?? 'laska.db');
    case 'postgres': {
      if (!config.postgresUrl) throw new Error('LASKA_DB=postgres requires DATABASE_URL');
      // Lazy import so `pg` is only required for Postgres deployments.
      const { PostgresRepository } = await import('./postgres.ts');
      const repo = new PostgresRepository(config.postgresUrl);
      await repo.init();
      return repo;
    }
    default: {
      const exhaustive: never = config.kind;
      throw new Error(`Unknown DB kind: ${String(exhaustive)}`);
    }
  }
}
