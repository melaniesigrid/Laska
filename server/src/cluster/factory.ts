/**
 * Build the configured cluster fabric. Redis is lazily imported so memory/SQLite
 * dev never needs the `redis` driver.
 */
import { InMemoryBroker } from './memory.ts';
import type { Cluster } from './types.ts';

export type ClusterKind = 'memory' | 'redis';

export interface ClusterConfig {
  kind: ClusterKind;
  redisUrl?: string;
}

export async function createCluster(config: ClusterConfig, nodeId: string): Promise<Cluster> {
  if (config.kind === 'redis') {
    if (!config.redisUrl) throw new Error('LASKA_CLUSTER=redis requires REDIS_URL');
    const { RedisCluster } = await import('./redis.ts');
    return RedisCluster.create(config.redisUrl, nodeId);
  }
  // Single-node in-memory fabric (one broker, one node).
  return new InMemoryBroker().attach(nodeId);
}
