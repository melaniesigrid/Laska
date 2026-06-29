import { Star, Shield, HelpCircle, type LucideIcon } from 'lucide-react';
import type { RankDTO } from '../../server/src/net/protocol.ts';

/**
 * RankBadge — a reusable neumorphic insignia that renders a displayed `Rank`
 * (the ladder from server/src/rating/rank.ts, carried on the wire as `RankDTO`).
 *
 * Stars everywhere (echoing the Heirloom general-star the pieces wear in
 * pieceTheme.tsx), differentiated by tier:
 *  - climb ranks (Recruit…Colonel): a shield plaque carrying the rank's 1..3
 *    sub-stars as vertical pips — debossed into the plate.
 *  - general tier: a cluster of 1..9 prestige stars (each a full skill step).
 *  - provisional: muted/desaturated with a `?` overlay; the label is suffixed
 *    with " ?" — the rank is not yet earned.
 *
 * The badge is sculpted purely from --light/--dark shadows on the shared --plate
 * ground (never a hard border), so it sits correctly on every [data-theme] palette.
 * The 'lg' size optionally shows a thin progress bar driven by `rank.progress`.
 */

export type RankBadgeSize = 'sm' | 'md' | 'lg';

/** Render a star count as glyphs ('★★') for climb sub-ranks, or '★N' for the
 *  open-ended general prestige stars (9 glyphs would be unwieldy). */
function starText(stars: number, isGeneral: boolean): string {
  return isGeneral ? `★${stars}` : '★'.repeat(Math.max(1, stars));
}

/** Climb: a shield plaque carrying the rank's 1..3 stars as vertical pips.
 *  Reuses the .rb-chevrons/.rb-chevron layout (centered, plate-toned, debossed). */
function ClimbInsignia({ stars }: { stars: number }) {
  const Plate: LucideIcon = Shield;
  return (
    <span className="rb-insignia rb-climb" aria-hidden="true">
      <Plate className="rb-plate" strokeWidth={1.5} absoluteStrokeWidth />
      <span className="rb-chevrons">
        {Array.from({ length: Math.max(1, Math.min(3, stars)) }).map((_, i) => (
          <Star key={i} className="rb-chevron" fill="currentColor" strokeWidth={1.5} absoluteStrokeWidth />
        ))}
      </span>
    </span>
  );
}

function GeneralInsignia({ stars }: { stars: number }) {
  // Up to 5 stars sit in a row; 6..9 wrap to a second row — keeps the cluster
  // compact and legible at every size while honoring the true star count.
  return (
    <span className="rb-insignia rb-general" aria-hidden="true">
      {Array.from({ length: Math.max(1, stars) }).map((_, i) => (
        <Star key={i} className="rb-star" fill="currentColor" strokeWidth={1.25} absoluteStrokeWidth />
      ))}
    </span>
  );
}

export function RankBadge({
  rank,
  size = 'md',
  showLabel = true,
}: {
  rank: RankDTO;
  size?: RankBadgeSize;
  showLabel?: boolean;
}) {
  const isGeneral = rank.tier === 'general';
  const stars = starText(rank.stars, isGeneral);
  const label = `${rank.name} ${stars}`;
  const pct = Math.round(Math.max(0, Math.min(1, rank.progress)) * 100);

  return (
    <span
      className={`rank-badge rb-${size} rb-tier-${rank.tier}${rank.provisional ? ' rb-provisional' : ''}`}
      title={rank.provisional ? `${label} — provisional (rating not yet calibrated)` : label}
      aria-label={`Rank: ${label}${rank.provisional ? ', provisional' : ''}`}
    >
      <span className="rb-medal" data-stars={isGeneral ? rank.stars : undefined}>
        {isGeneral ? <GeneralInsignia stars={rank.stars} /> : <ClimbInsignia stars={rank.stars} />}
        {rank.provisional && (
          <HelpCircle className="rb-provisional-mark" strokeWidth={2.5} aria-hidden="true" />
        )}
      </span>

      {showLabel && (
        <span className="rb-text">
          <span className="rb-name">
            {rank.name}
            <span className="rb-stars-suffix"> {stars}</span>
            {rank.provisional && <span className="rb-q"> ?</span>}
          </span>
          {size === 'lg' && (
            <span className="rb-progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
              <span className="rb-progress-fill" style={{ width: `${pct}%` }} />
            </span>
          )}
        </span>
      )}
    </span>
  );
}
