# SECURITY-001 — Auth rate limiter bypassable via spoofed X-Forwarded-For

**Owner:** backend-realtime-engineer
**Severity:** MEDIUM · **Confidence:** 9/10 · **Source:** /cso audit 2026-06-23 (VERIFIED, independent review)
**Files:** `server/src/net/httpApi.ts` (clientIp + usage), `server/src/config.ts` (new knob), `server/test/`

## Problem

`clientIp()` trusts the **leftmost** `X-Forwarded-For` entry, which is client-supplied:

```js
// server/src/net/httpApi.ts:33-38
function clientIp(req: IncomingMessage): string {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length > 0) return fwd.split(',')[0]!.trim();   // <-- spoofable
  if (Array.isArray(fwd) && fwd.length > 0) return fwd[0]!.split(',')[0]!.trim();
  return req.socket.remoteAddress ?? 'unknown';
}
```

Used as the auth rate-limit key:

```js
// server/src/net/httpApi.ts:111
const result = authLimiter.check(`${clientIp(req)} ${path}`);
```

Railway's edge proxy **appends** the real client IP to XFF rather than overwriting it, so the leftmost value is fully attacker-controlled. An attacker rotates `X-Forwarded-For` per request → each request gets a fresh sliding-window bucket → the `max=20 / 60s` throttle never trips.

## Impact

The rate limiter is the **only** anti-brute-force control (no account lockout, 8-char min / no complexity). Bypassing it enables:
- Online password brute-force / credential stuffing on `/auth/login`.
- Unbounded account + guest creation spam via `/auth/register`, `/auth/guest` (DB write amplification).

## Fix

Derive the client IP from the **trusted proxy hop count**, not the leftmost entry. Add an env knob so the value is correct per deployment (Railway = 1 trusted hop).

1. `config.ts` — add `trustedProxyHops` to `ServerConfig`, loaded from `LASKA_TRUSTED_PROXY_HOPS` (default `0` = trust nothing, use socket address; set to `1` in Railway env). Keep the existing `Number.isFinite`/floor/clamp pattern used by `loadAuthRateLimitConfig`.

2. `httpApi.ts` — rewrite `clientIp(req, trustedHops)`:
   - If `trustedHops <= 0` → return `req.socket.remoteAddress ?? 'unknown'` (ignore XFF entirely).
   - Else parse XFF into a list and take the entry `trustedHops` from the **right**: `list[list.length - trustedHops]` (the IP the outermost trusted proxy observed). Fall back to `req.socket.remoteAddress` if the list is too short.
   - Handle both the `string` and `string[]` header forms (flatten, split on `,`, trim, drop empties).
   - Thread `trustedHops` through `Deps` / `createHttpHandler` from config.

3. `index.ts` / `buildServer` — pass `config.trustedProxyHops` into `createHttpHandler` deps.

4. **Set `LASKA_TRUSTED_PROXY_HOPS=1` in the Railway service env** (deploy step, not code).

### Defense-in-depth (recommended, separate commit)
- Add per-email login backoff/lockout (exponential, independent of IP key) so a correct-IP attacker is still throttled.
- Optional: minimum password strength beyond length.

## Tests (`server/test/`)

Add cases against `createHttpHandler` with an injected `RateLimiter` (fake clock, as existing tests do):
- `trustedHops=0`: XFF header is ignored; all requests from one socket share a bucket and the 21st within the window gets `429`.
- `trustedHops=1`: two requests with **different** spoofed leftmost XFF but the **same** real (rightmost/socket) IP land in the **same** bucket → still rate-limited (regression test for this finding).
- `trustedHops=1`: requests from genuinely different upstream IPs (different rightmost entry) get independent buckets (no false throttling of distinct users behind the proxy).
- Malformed XFF (`","`, empty, single value) falls back to socket address without throwing.

## Definition of done
- `npm run typecheck` + `npm test` green in `server/`.
- New regression test fails on the current `split(',')[0]` code and passes after the fix.
- Railway env var documented in `CLAUDE.md` Gotchas (server env list) and `README`/deploy notes.
