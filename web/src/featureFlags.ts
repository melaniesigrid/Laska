/**
 * Build-time feature switches.
 *
 * ONLINE_ENABLED gates every entry point into online multiplayer: sign-in,
 * guest play, quick match, and the ranked leaderboard.
 *
 * It is currently `false` because the game server is not deployed. The web
 * client talks to `/api` over REST and `/ws` over WebSocket, but `vercel.json`
 * rewrites every path to `index.html`, so those requests come back as the SPA
 * document instead of JSON. Sign-in, "Play as guest" and the leaderboard all
 * fail the same way — the failure is the missing backend, not the auth code.
 *
 * Rather than show controls that cannot work, we hide them and keep the whole
 * single-player experience (AI opponents, lessons, openings, tutorial, replays)
 * fully available.
 *
 * To restore online play: deploy the server, route `/api` and `/ws` to it in
 * `vercel.json`, then flip this to `true`. Nothing else needs to change — every
 * online affordance is gated on this one constant.
 */
export const ONLINE_ENABLED = false;
