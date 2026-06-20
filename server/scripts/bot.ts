/**
 * Test opponent: registers a fresh guest, queues, and plays legal AI moves.
 * Used to drive an end-to-end browser test of the online client.
 *   node --experimental-transform-types scripts/bot.ts
 */
import { WebSocket } from 'ws';
import { chooseMove, decodePosition, encodePosition, type GameState } from '../../src/index.ts';
import type { ServerMessage } from '../src/net/protocol.ts';

const API = process.env.API ?? 'http://localhost:8080';
const WSURL = API.replace(/^http/, 'ws') + '/ws';

function stateFrom(position: string): GameState {
  const { board, toMove } = decodePosition(position);
  return { board, toMove, plyNoProgress: 0, positionCounts: { [encodePosition({ board, toMove })]: 1 } };
}

const resp = await fetch(`${API}/auth/guest`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
const { user, tokens } = (await resp.json()) as { user: { username: string }; tokens: { accessToken: string } };
console.log(`[bot] registered ${user.username}`);

const ws = new WebSocket(WSURL);
let myColor: 'W' | 'B' | null = null;
let matchId: string | null = null;

ws.on('open', () => {
  ws.send(JSON.stringify({ type: 'auth', token: tokens.accessToken }));
});

ws.on('message', (data) => {
  const msg = JSON.parse(String(data)) as ServerMessage;
  if (msg.type === 'auth.ok') {
    console.log('[bot] authed, joining queue');
    ws.send(JSON.stringify({ type: 'queue.join' }));
  } else if (msg.type === 'match.start') {
    myColor = msg.color;
    matchId = msg.matchId;
    console.log(`[bot] match started, I am ${myColor}`);
    maybeMove(msg.state.position, msg.state.toMove);
  } else if (msg.type === 'match.update') {
    maybeMove(msg.state.position, msg.state.toMove);
  } else if (msg.type === 'match.end') {
    console.log(`[bot] match ended: ${msg.result} (${msg.reason})`);
    process.exit(0);
  } else if (msg.type === 'error') {
    console.log(`[bot] error: ${msg.code} ${msg.message}`);
  }
});

function maybeMove(position: string, toMove: 'W' | 'B') {
  if (!matchId || toMove !== myColor) return;
  const state = stateFrom(position);
  const move = chooseMove(state, { difficulty: 'medium' });
  if (!move) return;
  setTimeout(() => {
    console.log(`[bot] playing ${move.from} -> ${move.to}`);
    const payload =
      move.captures.length > 0
        ? { type: 'match.move', matchId, from: move.from, to: move.to, captures: move.captures }
        : { type: 'match.move', matchId, from: move.from, to: move.to };
    ws.send(JSON.stringify(payload));
  }, 800);
}
