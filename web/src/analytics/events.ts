/* Analytics event taxonomy — the single source of truth for funnel event names.
 *
 * WHY a typed union: streaks, daily-puzzle, and billing engineers must emit the
 * SAME event names so the funnel joins up. Import `AnalyticsEvent` / the
 * payload map from here instead of inventing ad-hoc strings at call sites.
 *
 * Naming convention: `domain.thing_happened` (snake_case verb in past tense for
 * the action). Keep it stable — renaming an event orphans historical data.
 *
 * The funnel this instruments (charter goal):
 *   install → first match → signup → D1/D7 retention → first purchase
 *
 * COMPLIANCE (do not ship around): props here are deliberately NON-PII
 * (no email, no raw IP, no free-text usernames). `anonId` is a random local id,
 * not a stable cross-site identifier. Before adding any PII prop OR before
 * sending events to a real vendor, a GDPR/CCPA consent gate must exist and gate
 * the transport (see sink.ts). COPPA/age-gating applies before targeting minors.
 */

/** Funnel stage tags — lets downstream tooling group events without re-deriving
 *  the funnel from event names. Attached automatically to every event. */
export type FunnelStage =
  | 'acquisition' // install / first app load
  | 'activation' // first match started / finished
  | 'signup' // account created
  | 'retention' // return visits, streaks, D1/D7
  | 'monetization'; // purchases, subscriptions, paywalls

/** Every event name the app may emit. Add new names here (and a payload below)
 *  rather than passing a bare string to `track`. */
export type AnalyticsEvent =
  // --- acquisition --------------------------------------------------------
  | 'app.loaded' // first paint / SPA boot, fired once per session
  | 'app.returned' // a session that is NOT the user's first ever (D1/D7 signal)
  // --- activation (the core game loop) ------------------------------------
  | 'match.started' // a match began (local hotseat/AI or online)
  | 'match.first_move' // the user's FIRST committed move of a match (true activation)
  | 'match.finished' // a match reached a terminal outcome
  | 'hint.used' // the player asked the engine for the best move in a live game
  // --- signup -------------------------------------------------------------
  | 'auth.guest_started' // anonymous online session created
  | 'auth.signup_succeeded' // a real account was registered
  | 'auth.login_succeeded' // returning account signed in
  // --- retention (emitted by streaks/puzzles/quests engineers) ------------
  | 'streak.advanced' // daily streak incremented
  | 'streak.broken' // streak reset to 0
  | 'puzzle.started' // a daily puzzle / challenge opened
  | 'puzzle.solved' // a daily puzzle solved (engine-verified)
  | 'quest.completed' // a quest/mission completed
  | 'cosmetics.save_failed' // a cosmetic pick did NOT persist to the account
  // --- monetization (emitted by the billing engineer) ---------------------
  | 'paywall.viewed' // a paywall/upsell surface was shown
  | 'purchase.started' // checkout / billing flow opened
  | 'purchase.succeeded' // first or repeat purchase completed
  | 'subscription.started'; // a freemium subscription began

/** Per-event payload shapes. Keep props small, low-cardinality, and PII-free.
 *  `Record<string, never>` means "no props beyond the auto-attached context". */
export interface AnalyticsEventProps {
  'app.loaded': { firstEver: boolean };
  'app.returned': { daysSinceFirstSeen: number };

  'match.started': { mode: MatchMode; difficulty?: string; color?: 'W' | 'B' };
  'match.first_move': { mode: MatchMode };
  'match.finished': {
    mode: MatchMode;
    outcome: 'win' | 'loss' | 'draw';
    reason?: string;
    plies: number;
  };
  'hint.used': { mode: MatchMode; difficulty?: string };

  'auth.guest_started': Record<string, never>;
  'auth.signup_succeeded': { method: 'email' };
  'auth.login_succeeded': { method: 'email' };

  'streak.advanced': { length: number };
  'streak.broken': { previousLength: number };
  /** The pick still applied locally (optimistic UI); it just never reached the
   *  account. `status`/`code` distinguish a rejected value (400 invalid-cosmetic,
   *  i.e. a client/server allow-list drift) from a transient network failure. */
  'cosmetics.save_failed': { field: string; status?: number; code?: string };
  'puzzle.started': { puzzleId: string };
  'puzzle.solved': { puzzleId: string; attempts: number };
  'quest.completed': { questId: string };

  'paywall.viewed': { placement: string };
  'purchase.started': { sku: string; surface: PurchaseSurface };
  'purchase.succeeded': { sku: string; surface: PurchaseSurface; firstPurchase: boolean };
  'subscription.started': { plan: string; surface: PurchaseSurface };
}

/** How a match is being played. `online` vs local matters for the funnel because
 *  online play requires (guest or real) auth, so it sits past the signup stage. */
export type MatchMode = 'ai' | 'hotseat' | 'online';

/** Billing rail. NOTE for the billing engineer: web digital goods → Stripe;
 *  iOS/Android digital goods generally MUST use StoreKit / Play Billing (verify
 *  current commissions + small-business-program eligibility against live docs).
 *  This is a reporting tag only — it does not select a payment processor. */
export type PurchaseSurface = 'web_stripe' | 'ios_storekit' | 'android_play';

/** The funnel stage each event belongs to — drives stage-level rollups. */
export const EVENT_STAGE: Record<AnalyticsEvent, FunnelStage> = {
  'app.loaded': 'acquisition',
  'app.returned': 'acquisition',
  'match.started': 'activation',
  'match.first_move': 'activation',
  'match.finished': 'activation',
  'hint.used': 'activation',
  'auth.guest_started': 'signup',
  'auth.signup_succeeded': 'signup',
  'auth.login_succeeded': 'signup',
  'streak.advanced': 'retention',
  'streak.broken': 'retention',
  'cosmetics.save_failed': 'retention',
  'puzzle.started': 'retention',
  'puzzle.solved': 'retention',
  'quest.completed': 'retention',
  'paywall.viewed': 'monetization',
  'purchase.started': 'monetization',
  'purchase.succeeded': 'monetization',
  'subscription.started': 'monetization',
};
