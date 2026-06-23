/**
 * Design tokens mapped from ../../DESIGN.md (the web source of truth).
 *
 * The web system is neumorphic: every surface is sculpted from two shadows — a
 * cream highlight (top-left) and a clay shade (bottom-right). RN has no CSS
 * `box-shadow` with two offsets, so neumorphism is approximated with layered
 * Views / platform elevation (see neumorphic.ts).
 *
 * v1 ships the **Stone** palette (the web default). Other palettes (dark, navy,
 * light, chocolate, classic) are defined as data so a theme switcher can land
 * later without re-plumbing.
 */

export interface Palette {
  /** Board + background base; for neumorphism ground === plate. */
  ground: string;
  /** Cream highlight (top-left light source). */
  highlight: string;
  /** Clay shade (bottom-right). */
  shade: string;
  /** White army coin. */
  cream: string;
  /** Black army coin. */
  rose: string;
  /** Single accent (signals: selection, legal move, forced capture). */
  accent: string;
  /** Primary text on ground. */
  text: string;
  /** Muted text. */
  textMuted: string;
}

// Stone — the web `:root` default (laska.html palette). DESIGN.md "Color".
export const STONE: Palette = {
  ground: '#e8e4db',
  highlight: '#fbf8f2',
  shade: '#c4beb1',
  cream: '#f2ede3', // light army
  rose: '#4b463c', // dark army
  accent: '#5f8c7e', // eucalyptus
  text: '#4b463c',
  textMuted: '#8a8475',
};

// Dark — Stone inverted, warm-charcoal neumorphism.
export const DARK: Palette = {
  ground: '#2b2823',
  highlight: '#3a362f',
  shade: '#1d1b17',
  cream: '#e9e2d4',
  rose: '#b8a98f',
  accent: '#5f8c7e',
  text: '#e9e2d4',
  textMuted: '#a59d8c',
};

export const PALETTES = { stone: STONE, dark: DARK } as const;
export type PaletteName = keyof typeof PALETTES;

// Spacing — the web uses a clamp() scale; native uses a fixed step scale that a
// responsive util (theme/responsive.ts) can multiply by a device factor.
export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radius = {
  sm: 8,
  md: 16,
  lg: 24,
  pill: 999,
} as const;

// Typography. DESIGN.md: Display = Fraunces, Body/UI = Hanken Grotesk.
// Fonts must be loaded via expo-font (TODO: add the .ttf assets + useFonts).
// Until then these family names fall back to the platform default gracefully.
export const fonts = {
  display: 'Fraunces',
  body: 'HankenGrotesk',
} as const;

export const type = {
  title: { fontFamily: fonts.display, fontSize: 28, fontWeight: '600' as const },
  status: { fontFamily: fonts.display, fontSize: 18, fontWeight: '500' as const },
  body: { fontFamily: fonts.body, fontSize: 16, fontWeight: '400' as const },
  label: { fontFamily: fonts.body, fontSize: 13, fontWeight: '600' as const, letterSpacing: 1 },
} as const;
