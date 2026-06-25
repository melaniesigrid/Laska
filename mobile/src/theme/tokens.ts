/**
 * Design tokens mapped from ../../DESIGN.md and ../../web/src/styles.css (the web
 * source of truth).
 *
 * The web system is neumorphic: every surface is sculpted from two shadows — a
 * cream highlight (top-left, `--light`) and a clay shade (bottom-right, `--dark`)
 * — raised, or `inset` for recessed. React Native 0.81 (New Architecture) ships
 * a real `boxShadow` style prop that accepts MULTIPLE shadows + `inset`, so the
 * web recipes port almost 1:1 — see neumorphic.ts. (The old "RN can only do one
 * shadow" approximation is gone.)
 *
 * All six web palettes are ported as data; the theme switcher in ProfileScreen
 * cycles them and persists the choice (storage/prefs.ts).
 */

export interface Palette {
  /** Page background. For most themes === ground; Classic uses a deep navy page
   *  behind a clay board, so it differs. */
  backdrop: string;
  /** Neumorphic surface base (board, buttons, cards). ground === pedestal === plate. */
  ground: string;
  /** Cream highlight (top-left light source) — `--light`. */
  highlight: string;
  /** Clay shade (bottom-right) — `--dark`. */
  shade: string;
  /** White army coin — `--cream`. */
  cream: string;
  /** Black army coin — `--rose`. */
  rose: string;
  /** Single accent (selection, legal move, forced capture) — `--cobalt`. */
  accent: string;
  /** Primary text — `--ink`. */
  text: string;
  /** Muted text — `--ink-soft`. */
  textMuted: string;
  /** Button label ink — `--btn-ink`. */
  btnInk: string;
  /** Non-playable square fill — `--sq-light`. */
  sqLight: string;
  /** Playable square fill — `--sq-dark`. */
  sqDark: string;
  /** Playable-square inset shade (bevel low) — `--sq-lo`. */
  sqLo: string;
  /** Playable-square inset highlight (bevel high) — `--sq-hi`. */
  sqHi: string;
  /** Win state — `--win`. */
  win: string;
  /** Error/danger state — `--danger`. */
  danger: string;
  /** Coin drop-shadow colour as [r,g,b] — `--cast`. Use with rgba(). */
  castRGB: readonly [number, number, number];
  /** Accent ring colour as [r,g,b] — `--ring`. Use with rgba() for soft rings. */
  ringRGB: readonly [number, number, number];
}

/** rgba(...) from a palette's castRGB/ringRGB tuple at the given alpha. */
export function rgba(rgb: readonly [number, number, number], alpha: number): string {
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
}

// Stone — the web `:root` default (laska.html palette).
export const STONE: Palette = {
  backdrop: '#e8e4db',
  ground: '#e8e4db',
  highlight: '#fbf8f2',
  shade: '#c4beb1',
  cream: '#f2ede3',
  rose: '#4b463c',
  accent: '#5f8c7e',
  text: '#38342c',
  textMuted: '#6a6456', // WCAG AA 4.64:1 on ground (was #7a7363, 3.71:1)
  btnInk: '#645e51',
  sqLight: '#e8e4db',
  sqDark: '#e3ded3',
  sqLo: '#c4beb1',
  sqHi: '#fbf8f2',
  win: '#4a7165',
  danger: '#b4453a',
  castRGB: [96, 88, 74],
  ringRGB: [95, 140, 126],
};

// Dark — Stone inverted, warm-charcoal neumorphism.
export const DARK: Palette = {
  backdrop: '#2b2823',
  ground: '#2b2823',
  highlight: '#37332c',
  shade: '#1e1b17',
  cream: '#e9e2d4',
  rose: '#8a7c66',
  accent: '#7caa9b',
  text: '#ece4d6',
  textMuted: '#9a9082',
  btnInk: '#cabfab',
  sqLight: '#2b2823',
  sqDark: '#322e28',
  sqLo: '#1e1b17',
  sqHi: '#37332c',
  win: '#8fbf9c',
  danger: '#c75c50',
  castRGB: [8, 7, 5],
  ringRGB: [124, 170, 155],
};

// Light — lasca-soft warm clay.
export const LIGHT: Palette = {
  backdrop: '#e3c3b2',
  ground: '#e3c3b2',
  highlight: '#f8e0d1',
  shade: '#cf9488',
  cream: '#f1e3d2',
  rose: '#d08c79',
  accent: '#303dbe',
  text: '#7c4234',
  textMuted: '#744b3f', // WCAG AA 4.51:1 on ground (was #9a6354, 2.97:1)
  btnInk: '#744b3f',
  sqLight: '#ecd4c3',
  sqDark: '#d3b19b',
  sqLo: '#bd9a85',
  sqHi: '#e2c2ad',
  win: '#2f7d5c',
  danger: '#b4453a',
  castRGB: [120, 70, 52],
  ringRGB: [48, 61, 190],
};

// Chocolate — warm chocolate material. ground tracks the web `--pedestal` so the
// shade/highlight pair (tuned around it) reads as sculpted.
export const CHOCOLATE: Palette = {
  // Ground deepened #9a6c45 -> #845d3b so light text clears AA: primary 5.20:1,
  // btnInk 4.57:1. Muted (#ead9bf, 4.20:1) meets AA-large; a mid-brown ground
  // can't carry a visually-dimmer muted at AA-small without going monochrome.
  backdrop: '#7a5435',
  ground: '#845d3b',
  highlight: '#bd8f5f',
  shade: '#5e3f26',
  cream: '#f3e7d3',
  rose: '#5a3d24',
  accent: '#d8b27a',
  text: '#fbf1e1',
  textMuted: '#ead9bf',
  btnInk: '#f0e2cf',
  sqLight: '#9a6c45',
  sqDark: '#a3714a',
  sqLo: '#6b4a2c',
  sqHi: '#c19564',
  win: '#9fd0ac',
  danger: '#e08a6a',
  castRGB: [42, 26, 14],
  ringRGB: [216, 178, 122],
};

// Navy — naval board, blue/red armies, gold general insignia.
export const NAVY: Palette = {
  backdrop: '#182b4d',
  ground: '#182b4d',
  highlight: '#27466f',
  shade: '#0d1b31',
  cream: '#397fd1',
  rose: '#c94d55',
  accent: '#f0c84b',
  text: '#f3f6fb',
  textMuted: '#a9bdd7',
  btnInk: '#d8e5f5',
  sqLight: '#1b3156',
  sqDark: '#213a61',
  sqLo: '#10213b',
  sqHi: '#2b4c7a',
  win: '#8dd2af',
  danger: '#c94d55',
  castRGB: [5, 13, 28],
  ringRGB: [240, 200, 75],
};

// Classic — clay surfaces. NOTE: the web floats the clay board on a deep-navy
// page, but on mobile every screen paints `backdrop` and draws `text` on it, so
// a navy backdrop + dark-clay text = invisible titles. We use the clay ground as
// backdrop here (drops the navy-page flourish; revisit with a per-surface text
// token if the two-surface look is wanted). See DESIGN_POLISH.md.
export const CLASSIC: Palette = {
  backdrop: '#e3c3b2',
  ground: '#e3c3b2',
  highlight: '#f8e0d1',
  shade: '#cf9488',
  cream: '#f1e3d2',
  rose: '#d08c79',
  accent: '#303dbe',
  text: '#7c4234',
  textMuted: '#744b3f', // WCAG AA 4.51:1 on ground
  btnInk: '#744b3f',
  sqLight: '#ecd4c3',
  sqDark: '#d3b19b',
  sqLo: '#bd9a85',
  sqHi: '#e2c2ad',
  win: '#8fc7a8',
  danger: '#b4453a',
  castRGB: [120, 70, 52],
  ringRGB: [48, 61, 190],
};

export const PALETTES = {
  stone: STONE,
  dark: DARK,
  light: LIGHT,
  chocolate: CHOCOLATE,
  navy: NAVY,
  classic: CLASSIC,
} as const;
export type PaletteName = keyof typeof PALETTES;

/** Display order + labels for the theme switcher. */
export const PALETTE_ORDER: { name: PaletteName; label: string }[] = [
  { name: 'stone', label: 'Stone' },
  { name: 'dark', label: 'Dark' },
  { name: 'light', label: 'Light' },
  { name: 'chocolate', label: 'Cocoa' },
  { name: 'navy', label: 'Navy' },
  { name: 'classic', label: 'Classic' },
];

// Spacing — the web uses a clamp() scale; native uses a fixed step scale.
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

/**
 * Typography. DESIGN.md: Display = Fraunces, Body/UI = Hanken Grotesk.
 * Loaded via @expo-google-fonts/* in App.tsx (useFonts). Custom fonts don't
 * synthesize weight on RN, so each weight is its own baked family name; we set
 * the exact family per token and omit numeric fontWeight.
 */
export const fonts = {
  displaySemi: 'Fraunces_600SemiBold',
  displayMedium: 'Fraunces_500Medium',
  bodyRegular: 'HankenGrotesk_400Regular',
  bodySemi: 'HankenGrotesk_600SemiBold',
} as const;

export const type = {
  title: { fontFamily: fonts.displaySemi, fontSize: 28 },
  status: { fontFamily: fonts.displayMedium, fontSize: 18 },
  body: { fontFamily: fonts.bodyRegular, fontSize: 16 },
  label: { fontFamily: fonts.bodySemi, fontSize: 13, letterSpacing: 1 },
} as const;
