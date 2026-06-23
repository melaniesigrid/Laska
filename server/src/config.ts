/**
 * Server configuration from environment, with safe-ish dev defaults.
 *
 * In production you MUST set strong, distinct secrets via env. The defaults
 * here exist only so `npm run dev` works out of the box; they are clearly
 * marked and the server warns when they are used.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import type { DbConfig, DbKind } from './storage/factory.ts';
import type { ClusterConfig, ClusterKind } from './cluster/factory.ts';

export interface ServerConfig {
  port: number;
  accessSecret: string;
  refreshSecret: string;
  startingRating: number;
  usingDefaultSecrets: boolean;
  db: DbConfig;
  cluster: ClusterConfig;
  /** Stable id for this node within a cluster. */
  nodeId: string;
  /**
   * Rate-limit knobs for the auth HTTP endpoints. Optional so existing test
   * config literals keep compiling; `loadConfig` always populates it and
   * `buildServer` falls back to a safe default when absent.
   */
  authRateLimit?: AuthRateLimitConfig;
}

export interface AuthRateLimitConfig {
  /** Max auth requests per client IP + endpoint within the window. */
  max: number;
  /** Rolling window length in milliseconds. */
  windowMs: number;
}

function loadAuthRateLimitConfig(env: NodeJS.ProcessEnv): AuthRateLimitConfig {
  const max = env.LASKA_AUTH_RATE_MAX ? Number(env.LASKA_AUTH_RATE_MAX) : 20;
  const windowMs = env.LASKA_AUTH_RATE_WINDOW_MS ? Number(env.LASKA_AUTH_RATE_WINDOW_MS) : 60_000;
  return {
    max: Number.isFinite(max) && max > 0 ? Math.floor(max) : 20,
    windowMs: Number.isFinite(windowMs) && windowMs > 0 ? Math.floor(windowMs) : 60_000,
  };
}

function loadClusterConfig(env: NodeJS.ProcessEnv): ClusterConfig {
  const raw = (env.LASKA_CLUSTER ?? (env.REDIS_URL ? 'redis' : 'memory')).toLowerCase();
  const kind: ClusterKind = raw === 'redis' ? 'redis' : 'memory';
  const cluster: ClusterConfig = { kind };
  if (kind === 'redis' && env.REDIS_URL) cluster.redisUrl = env.REDIS_URL;
  return cluster;
}

function loadDbConfig(env: NodeJS.ProcessEnv): DbConfig {
  const raw = (env.LASKA_DB ?? 'sqlite').toLowerCase();
  const kind: DbKind = raw === 'memory' || raw === 'postgres' ? raw : 'sqlite';
  const db: DbConfig = { kind };
  if (kind === 'sqlite') db.sqlitePath = env.LASKA_DB_PATH ?? 'laska.db';
  if (kind === 'postgres' && env.DATABASE_URL) db.postgresUrl = env.DATABASE_URL;
  return db;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const accessFromEnv = env.LASKA_ACCESS_SECRET;
  const refreshFromEnv = env.LASKA_REFRESH_SECRET;
  const usingDefaultSecrets = !accessFromEnv || !refreshFromEnv;

  return {
    port: env.PORT ? Number(env.PORT) : 8080,
    // Random per-boot secrets in dev mean tokens don't survive a restart, which
    // is fine for local dev and far safer than a hardcoded constant.
    accessSecret: accessFromEnv ?? randomBytes(32).toString('hex'),
    refreshSecret: refreshFromEnv ?? randomBytes(32).toString('hex'),
    startingRating: env.LASKA_STARTING_RATING ? Number(env.LASKA_STARTING_RATING) : 1200,
    usingDefaultSecrets,
    db: loadDbConfig(env),
    cluster: loadClusterConfig(env),
    nodeId: env.LASKA_NODE_ID ?? `node-${randomUUID().slice(0, 8)}`,
    authRateLimit: loadAuthRateLimitConfig(env),
  };
}
