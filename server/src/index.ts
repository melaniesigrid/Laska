/**
 * Laska server entry point: an HTTP API + a WebSocket game server sharing one
 * repository and the same authoritative rules engine the client uses.
 *
 * Run:  npm run dev   (Node >= 22, native TS)
 *
 * Storage is selected by `LASKA_DB` (sqlite [default, durable file] | memory |
 * postgres). `buildServer` accepts an explicit repository so tests can inject an
 * in-memory one; the standalone entry below builds the configured durable repo.
 */
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { loadConfig, type ServerConfig } from './config.ts';
import { InMemoryRepository } from './storage/memory.ts';
import { createRepository } from './storage/factory.ts';
import type { Repository } from './storage/types.ts';
import { InMemoryBroker } from './cluster/memory.ts';
import { createCluster } from './cluster/factory.ts';
import type { Cluster } from './cluster/types.ts';
import { AuthService } from './auth/service.ts';
import { MatchManager } from './game/manager.ts';
import { GameServer } from './net/gameServer.ts';
import { createHttpHandler } from './net/httpApi.ts';

export function buildServer(
  config: ServerConfig = loadConfig(),
  repo: Repository = new InMemoryRepository(),
  cluster: Cluster = new InMemoryBroker().attach(`node-${randomUUID().slice(0, 8)}`),
) {
  const auth = new AuthService(repo, {
    accessSecret: config.accessSecret,
    refreshSecret: config.refreshSecret,
    startingRating: config.startingRating,
  });
  const manager = new MatchManager(repo);
  const gameServer = new GameServer(repo, auth, manager, cluster);

  const httpHandler = createHttpHandler({ auth, repo });
  const http = createServer((req, res) => void httpHandler(req, res));
  const wss = new WebSocketServer({ server: http, path: '/ws' });
  wss.on('connection', (ws) => gameServer.handleConnection(ws));

  return { repo, auth, manager, cluster, gameServer, http, wss };
}

// Start only when run directly (not when imported by tests).
if (import.meta.url === `file://${process.argv[1]}`) {
  void (async () => {
    const config = loadConfig();
    const repo = await createRepository(config.db);
    const nodeId = config.nodeId;
    const cluster = await createCluster(config.cluster, nodeId);
    const { http, gameServer, wss } = buildServer(config, repo, cluster);
    gameServer.start();
    http.listen(config.port, () => {
      console.log(`Laska server listening on http://localhost:${config.port}`);
      console.log(`  WebSocket: ws://localhost:${config.port}/ws`);
      console.log(`  Storage:   ${config.db.kind}${config.db.kind === 'sqlite' ? ` (${config.db.sqlitePath})` : ''}`);
      console.log(`  Cluster:   ${config.cluster.kind} (node ${nodeId})`);
      if (config.usingDefaultSecrets) {
        console.warn(
          '  WARNING: using random per-boot token secrets. Set LASKA_ACCESS_SECRET and ' +
            'LASKA_REFRESH_SECRET in production so tokens survive restarts.',
        );
      }
    });

    const shutdown = () => {
      gameServer.stop();
      wss.close();
      http.close(() => {
        void Promise.allSettled([repo.close?.(), cluster.close()]).finally(() => process.exit(0));
      });
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  })();
}
