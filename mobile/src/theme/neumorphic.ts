/**
 * Neumorphic shadow helpers. The web uses two offset box-shadows (a top-left
 * highlight + a bottom-right shade). RN/iOS shadow props support only ONE offset
 * direction per View, and Android uses `elevation` (no offset control). So:
 *
 *  - RAISED surfaces: a single bottom-right shadow + a light top border read as
 *    lifted. For full two-shadow fidelity, stack two absolutely-positioned shadow
 *    layers behind the surface (see Board/Coin components) — that's the faithful
 *    route but heavier; this helper is the lightweight default.
 *  - RECESSED surfaces: RN cannot inset-shadow a View. Approximate with a darker
 *    fill + an inner hairline. True inset shadows need react-native-svg or an
 *    inner-shadow lib — VERIFY/choose one when board fidelity is tuned.
 *
 * Keep this the single place shadow math lives so the look stays consistent.
 */
import { Platform, ViewStyle } from 'react-native';
import type { Palette } from './tokens';

export function raised(p: Palette, depth = 6): ViewStyle {
  return Platform.select<ViewStyle>({
    ios: {
      shadowColor: p.shade,
      shadowOffset: { width: depth * 0.6, height: depth * 0.6 },
      shadowOpacity: 0.9,
      shadowRadius: depth,
      backgroundColor: p.ground,
    },
    android: {
      elevation: depth,
      backgroundColor: p.ground,
    },
    default: { backgroundColor: p.ground },
  })!;
}

export function pressed(p: Palette): ViewStyle {
  // Pressed = the web's inset look. Flatten elevation and darken slightly.
  return {
    backgroundColor: p.shade,
    shadowOpacity: 0,
    elevation: 0,
  };
}
