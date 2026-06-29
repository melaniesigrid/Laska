import { createContext, useContext } from 'react';
import { Star, Crown, Shield } from 'lucide-react';
import type { Rank } from '../../src/index.ts';

/**
 * Piece insignia themes — the mark a commander wears to show its rank.
 *
 * The engine only knows two ranks (soldier / officer); a theme decides how each
 * reads on the coin. The default, Heirloom, gives generals an embossed star
 * instead of two dots — far easier for a first-timer to parse at a glance than
 * counting pips. Themes are cosmetic only: they never change the rules.
 */
export type PieceTheme = 'heirloom' | 'lineage' | 'dots';

export const PIECE_THEMES: PieceTheme[] = ['heirloom', 'lineage', 'dots'];

export const PIECE_THEME_LABEL: Record<PieceTheme, string> = {
  heirloom: 'Heirloom',
  lineage: 'Lineage',
  dots: 'Dots',
};

/** One-line description, shown wherever the theme is chosen. */
export const PIECE_THEME_BLURB: Record<PieceTheme, string> = {
  heirloom: 'Engraved star for generals',
  lineage: 'Shield and crown — Lasker’s chess lineage',
  dots: 'One dot soldier, two dots general',
};

/** Default = Heirloom. The landing demo reads this when no provider wraps it. */
export const PieceThemeContext = createContext<PieceTheme>('heirloom');
export const usePieceTheme = () => useContext(PieceThemeContext);

/** Lucide icons are stroke-based; filled + thin stroke reads as an inlay. */
const ICON = { strokeWidth: 1.25, absoluteStrokeWidth: true } as const;

function Pips({ n }: { n: number }) {
  return (
    <span className="dots" aria-hidden="true">
      {Array.from({ length: n }).map((_, i) => (
        <span key={i} className="dot-pip" />
      ))}
    </span>
  );
}

/**
 * The mark for a commander of `rank`, under the active `theme`. Color + the
 * engraved (drop-shadow) bevel come from `.disc.cream/.rose .insignia` in CSS,
 * so the same element reads correctly on either faction.
 */
export function Insignia({ theme, rank }: { theme: PieceTheme; rank: Rank }) {
  const officer = rank === 'officer';
  switch (theme) {
    case 'dots':
      return <Pips n={officer ? 2 : 1} />;
    case 'lineage':
      return officer ? (
        <Crown className="insignia ins-officer" fill="currentColor" {...ICON} aria-hidden="true" />
      ) : (
        <Shield className="insignia ins-soldier" fill="currentColor" {...ICON} aria-hidden="true" />
      );
    case 'heirloom':
    default:
      // Generals wear an engraved star; soldiers a single engraved dot.
      return officer ? (
        <Star className="insignia ins-officer" fill="currentColor" {...ICON} aria-hidden="true" />
      ) : (
        <Pips n={1} />
      );
  }
}
