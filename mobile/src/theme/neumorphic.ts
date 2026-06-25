/**
 * Neumorphic shadow helpers — a faithful port of the web's two-shadow language
 * (../../web/src/styles.css). React Native 0.81 on the New Architecture supports
 * the `boxShadow` style prop with MULTIPLE shadows and `inset`, so we emit the
 * exact same recipe the web uses: a clay shade bottom-right + a cream highlight
 * top-left, flipped to `inset` for recessed surfaces.
 *
 * This is the single place shadow math lives. Tune depth here, not per-component.
 *
 *   raised()  → lifted button / card / board panel      (web `.btn`, `.board`)
 *   inset()   → recessed pill / tray / segmented rail    (web `.status`, `.field`)
 *   pressed() → a button being held down                 (web `.btn:active`)
 */
import type { ViewStyle } from 'react-native';
import type { Palette } from './tokens';

type Shadows = NonNullable<ViewStyle['boxShadow']>;

/** Lifted surface: dark shade bottom-right + cream highlight top-left (outset). */
export function raised(p: Palette, depth = 6): ViewStyle {
  const blur = depth * 2;
  return {
    backgroundColor: p.ground,
    boxShadow: [
      { offsetX: depth, offsetY: depth, blurRadius: blur, color: p.shade },
      { offsetX: -depth, offsetY: -depth, blurRadius: blur, color: p.highlight },
    ] satisfies Shadows,
  };
}

/** Recessed surface: the same pair, inset — the tray/pill/rail look. */
export function inset(p: Palette, depth = 5): ViewStyle {
  const blur = depth * 1.9;
  return {
    backgroundColor: p.ground,
    boxShadow: [
      { inset: true, offsetX: depth, offsetY: depth, blurRadius: blur, color: p.shade },
      { inset: true, offsetX: -depth, offsetY: -depth, blurRadius: blur, color: p.highlight },
    ] satisfies Shadows,
  };
}

/** Held-down button: web `.btn:active` flips raised → a slightly tighter inset. */
export function pressed(p: Palette, depth = 5): ViewStyle {
  return inset(p, depth);
}
