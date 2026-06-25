/**
 * Native Laska client — a faithful port of web/src/net/client.ts.
 *
 * IDENTICAL to the web client in protocol, REST endpoints, reconnect/backoff,
 * and token-refresh behaviour. The ONLY differences are platform storage:
 *   - web uses synchronous `localStorage`;
 *   - native uses async SecureStore (Keychain/Keystore), injected as an
 *     AsyncTokenStore. So token load is an explicit async `init()` and
 *     persistence is async (fire-and-forget on the hot paths, awaited on auth).
 *
 * `fetch` and `WebSocket` are RN built-ins, used unchanged.
 *
 * Drift guard: the message types come from the SHARED protocol file, so this
 * client and the server cannot disagree on the wire format.
 *
 * FUTURE: unify with the web client by making storage injectable there too
 * (default localStorage). See ../../MOBILE.md "The one real blocker".
 */
import type { ClientMessage, ServerMessage } from '../../../server/src/net/protocol.ts';
import { secureTokenStore, type AsyncTokenStore, type AuthTokens } from '../storage/secureTokens.ts';

export type { AuthTokens };

export interface PublicUser {
  id: string;
  username: string;
  email: string | null;
  isGuest: boolean;
  emailVerified: boolean;
  rating: number;
  ratedGames: number;
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
    private store: AsyncTokenStore = secureTokenStore,
  ) {}

  /** Load persisted tokens from secure storage. Call once before restore(). */
  async init(): Promise<void> {
    this.tokens = await this.store.load();
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

  private async req<T>(
    path: string,
    opts: { method?: string; body?: unknown; auth?: boolean } = {},
  ): Promise<T> {
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
      throw new ApiError(
        res.status,
        (data as { error?: string }).error ?? 'error',
        (data as { message?: string }).message ?? res.statusText,
      );
    }
    return data as T;
  }

  private async persistTokens(): Promise<void> {
    await this.store.save(this.tokens);
  }

  private async adopt(resp: AuthResponse): Promise<PublicUser> {
    this.user = resp.user;
    this.tokens = resp.tokens;
    await this.persistTokens();
    return resp.user;
  }

  async register(email: string, password: string, username: string): Promise<PublicUser> {
    return this.adopt(
      await this.req<AuthResponse>('/auth/register', { method: 'POST', body: { email, password, username } }),
    );
  }

  async login(email: string, password: string): Promise<PublicUser> {
    return this.adopt(await this.req<AuthResponse>('/auth/login', { method: 'POST', body: { email, password } }));
  }

  async guest(): Promise<PublicUser> {
    return this.adopt(await this.req<AuthResponse>('/auth/guest', { method: 'POST', body: {} }));
  }

  async linkGuest(email: string, password: string, username: string): Promise<PublicUser> {
    return this.adopt(
      await this.req<AuthResponse>('/auth/link', { method: 'POST', body: { email, password, username }, auth: true }),
    );
  }

  /** Try to restore a session from a stored refresh token. */
  async restore(): Promise<PublicUser | null> {
    if (!this.tokens) return null;
    try {
      const { tokens } = await this.req<{ tokens: AuthTokens }>('/auth/refresh', {
        method: 'POST',
        body: { refreshToken: this.tokens.refreshToken },
      });
      this.tokens = tokens;
      await this.persistTokens();
      const { user } = await this.req<{ user: PublicUser }>('/me', { auth: true });
      this.user = user;
      return user;
    } catch {
      this.tokens = null;
      this.user = null;
      await this.persistTokens();
      return null;
    }
  }

  async refreshAccess(): Promise<boolean> {
    if (!this.tokens) return false;
    try {
      const { tokens } = await this.req<{ tokens: AuthTokens }>('/auth/refresh', {
        method: 'POST',
        body: { refreshToken: this.tokens.refreshToken },
      });
      this.tokens = tokens;
      await this.persistTokens();
      return true;
    } catch {
      return false;
    }
  }

  async leaderboard(
    limit = 50,
  ): Promise<{ leaderboard: { userId: string; username: string; rating: number; ratedGames: number }[] }> {
    return this.req(`/leaderboard?limit=${limit}`);
  }

  /**
   * Register this device's push token with the server (retention notifications).
   * NOTE: the `/push/register` endpoint does not exist server-side yet — owned by
   * the backend engineer (see ../../MOBILE.md). Fails soft until it ships.
   */
  async registerPushToken(token: string, platform: 'ios' | 'android'): Promise<void> {
    try {
      await this.req('/push/register', { method: 'POST', body: { token, platform }, auth: true });
    } catch {
      // best-effort; push is non-critical and the endpoint may not exist yet.
    }
  }

  async logout(): Promise<void> {
    this.tokens = null;
    this.user = null;
    await this.persistTokens();
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
      this.send({ type: 'auth', token: this.tokens!.accessToken });
      if (this.currentMatchId) this.send({ type: 'match.sync', matchId: this.currentMatchId });
    };

    ws.onmessage = (ev) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(typeof ev.data === 'string' ? ev.data : '') as ServerMessage;
      } catch {
        return;
      }
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
