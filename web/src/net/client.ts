/**
 * Browser client for the Laska server: REST for auth, WebSocket for live play.
 *
 * It reuses the SERVER's protocol types (one source of truth — client and server
 * cannot drift), auto-refreshes the access token, and transparently reconnects
 * the socket, re-authenticating and resyncing any in-progress match.
 */
import type {
  ClientMessage,
  ServerMessage,
  RankDTO,
  BotDifficulty,
  BotColorPreference,
} from '../../../server/src/net/protocol.ts';
import type { VariantId } from '../../../src/index.ts';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface PublicUser {
  id: string;
  username: string;
  email: string | null;
  isGuest: boolean;
  emailVerified: boolean;
  rating: number;
  ratedGames: number;
  /** Glicko-2 uncertainty; high RD ⇒ provisional rank. */
  ratingDeviation: number;
  /** Displayed military rank derived from rating + confidence. */
  rank: RankDTO;
}

/** One row of the global leaderboard (REST `GET /leaderboard`). */
export interface LeaderboardRow {
  userId: string;
  username: string;
  rating: number;
  ratedGames: number;
  ratingDeviation: number;
  rank: RankDTO;
}

export type ConnStatus = 'disconnected' | 'connecting' | 'connected';

export interface ClientHandlers {
  onMessage?: (msg: ServerMessage) => void;
  onStatus?: (status: ConnStatus) => void;
}

interface AuthResponse {
  user: PublicUser;
  tokens: AuthTokens;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const STORAGE_KEY = 'laska.tokens';

export class LaskaClient {
  private ws: WebSocket | null = null;
  private status: ConnStatus = 'disconnected';
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private deliberatelyClosed = false;
  private currentMatchId: string | null = null;

  tokens: AuthTokens | null = null;
  user: PublicUser | null = null;

  constructor(
    private apiBase: string,
    private wsUrl: string,
    private handlers: ClientHandlers = {},
  ) {
    const saved = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    if (saved) {
      try {
        this.tokens = JSON.parse(saved) as AuthTokens;
      } catch {
        /* ignore corrupt storage */
      }
    }
  }

  setHandlers(h: ClientHandlers): void {
    this.handlers = h;
  }

  getStatus(): ConnStatus {
    return this.status;
  }

  setCurrentMatch(matchId: string | null): void {
    this.currentMatchId = matchId;
  }

  // ---- REST -------------------------------------------------------------

  private async req<T>(path: string, opts: { method?: string; body?: unknown; auth?: boolean } = {}): Promise<T> {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (opts.auth && this.tokens) headers['authorization'] = `Bearer ${this.tokens.accessToken}`;
    const res = await fetch(`${this.apiBase}${path}`, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    const text = await res.text();
    const data = text ? JSON.parse(text) : {};
    if (!res.ok) {
      throw new ApiError(res.status, (data as { error?: string }).error ?? 'error', (data as { message?: string }).message ?? res.statusText);
    }
    return data as T;
  }

  private persistTokens(): void {
    if (typeof localStorage === 'undefined') return;
    if (this.tokens) localStorage.setItem(STORAGE_KEY, JSON.stringify(this.tokens));
    else localStorage.removeItem(STORAGE_KEY);
  }

  private adopt(resp: AuthResponse): PublicUser {
    this.user = resp.user;
    this.tokens = resp.tokens;
    this.persistTokens();
    return resp.user;
  }

  async register(email: string, password: string, username: string): Promise<PublicUser> {
    return this.adopt(await this.req<AuthResponse>('/auth/register', { method: 'POST', body: { email, password, username } }));
  }

  async login(email: string, password: string): Promise<PublicUser> {
    return this.adopt(await this.req<AuthResponse>('/auth/login', { method: 'POST', body: { email, password } }));
  }

  async guest(): Promise<PublicUser> {
    return this.adopt(await this.req<AuthResponse>('/auth/guest', { method: 'POST', body: {} }));
  }

  async linkGuest(email: string, password: string, username: string): Promise<PublicUser> {
    return this.adopt(await this.req<AuthResponse>('/auth/link', { method: 'POST', body: { email, password, username }, auth: true }));
  }

  /** Try to restore a session from a stored refresh token. */
  async restore(): Promise<PublicUser | null> {
    if (!this.tokens) return null;
    try {
      const { tokens } = await this.req<{ tokens: AuthTokens }>('/auth/refresh', { method: 'POST', body: { refreshToken: this.tokens.refreshToken } });
      this.tokens = tokens;
      this.persistTokens();
      const { user } = await this.req<{ user: PublicUser }>('/me', { auth: true });
      this.user = user;
      return user;
    } catch {
      this.tokens = null;
      this.user = null;
      this.persistTokens();
      return null;
    }
  }

  async refreshAccess(): Promise<boolean> {
    if (!this.tokens) return false;
    try {
      const { tokens } = await this.req<{ tokens: AuthTokens }>('/auth/refresh', { method: 'POST', body: { refreshToken: this.tokens.refreshToken } });
      this.tokens = tokens;
      this.persistTokens();
      return true;
    } catch {
      return false;
    }
  }

  async leaderboard(limit = 50): Promise<{ leaderboard: LeaderboardRow[] }> {
    return this.req(`/leaderboard?limit=${limit}`);
  }

  logout(): void {
    this.tokens = null;
    this.user = null;
    this.persistTokens();
    this.disconnect();
  }

  // ---- WebSocket --------------------------------------------------------

  connect(): void {
    if (!this.tokens) throw new Error('Authenticate before connecting');
    this.deliberatelyClosed = false;
    this.openSocket();
  }

  private setStatus(s: ConnStatus): void {
    this.status = s;
    this.handlers.onStatus?.(s);
  }

  private openSocket(): void {
    this.setStatus('connecting');
    const ws = new WebSocket(this.wsUrl);
    this.ws = ws;

    ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.setStatus('connected');
      // Authenticate first thing on every (re)connection.
      this.send({ type: 'auth', token: this.tokens!.accessToken });
      // If we were in a match, ask the server for the authoritative state.
      if (this.currentMatchId) this.send({ type: 'match.sync', matchId: this.currentMatchId });
    };

    ws.onmessage = (ev) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(typeof ev.data === 'string' ? ev.data : '') as ServerMessage;
      } catch {
        return;
      }
      // If our access token expired mid-session, refresh and re-auth once.
      if (msg.type === 'error' && msg.code === 'auth-failed') {
        void this.refreshAccess().then((ok) => {
          if (ok) this.send({ type: 'auth', token: this.tokens!.accessToken });
        });
        return;
      }
      this.handlers.onMessage?.(msg);
    };

    ws.onclose = () => {
      this.ws = null;
      this.setStatus('disconnected');
      if (!this.deliberatelyClosed) this.scheduleReconnect();
    };

    ws.onerror = () => {
      // onclose will follow and handle reconnect.
      ws.close();
    };
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    const delay = Math.min(15000, 500 * 2 ** this.reconnectAttempts);
    this.reconnectAttempts += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.tokens) this.openSocket();
    }, delay);
  }

  send(msg: ClientMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  /**
   * Start a RANKED match against the server's built-in computer opponent. The bot
   * runs server-side; the result feeds the SAME Glicko-2 leaderboard as human play.
   * On success the server replies with the normal `match.start` (opponent is the
   * tier's "Computer (…)" account), so it flows through the existing match path.
   * `color` is the HUMAN's side preference; `variant` absent means Laska.
   */
  startBotMatch(difficulty: BotDifficulty, color: BotColorPreference = 'random', variant?: VariantId): void {
    const msg: ClientMessage = { type: 'match.startBot', difficulty, color };
    if (variant && variant !== 'laska') msg.variant = variant;
    this.send(msg);
  }

  disconnect(): void {
    this.deliberatelyClosed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
    this.setStatus('disconnected');
  }
}
