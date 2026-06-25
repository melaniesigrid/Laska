/**
 * Tab-bar icons, hand-drawn as lucide-style line glyphs with react-native-svg.
 * We draw our own (rather than add @expo/vector-icons) to keep deps lean and to
 * match the web's lucide aesthetic exactly. 24×24 viewBox, stroke = tint color.
 *
 *   play    → a checker coin (circle + centre pip) — on-theme for Laska columns
 *   online  → globe
 *   profile → user (head + shoulders)
 */
import React from 'react';
import Svg, { Circle, Path, Line } from 'react-native-svg';

export type TabIconName = 'play' | 'online' | 'profile';

export function TabIcon({
  name,
  color,
  size = 24,
}: {
  name: TabIconName;
  color: string;
  size?: number;
}) {
  const sw = 2;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {name === 'play' && (
        <>
          <Circle cx={12} cy={12} r={8.5} stroke={color} strokeWidth={sw} />
          <Circle cx={12} cy={12} r={2.4} fill={color} />
        </>
      )}
      {name === 'online' && (
        <>
          <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={sw} />
          <Line x1={3} y1={12} x2={21} y2={12} stroke={color} strokeWidth={sw} />
          <Path
            d="M12 3c2.6 2.4 4 5.6 4 9s-1.4 6.6-4 9c-2.6-2.4-4-5.6-4-9s1.4-6.6 4-9z"
            stroke={color}
            strokeWidth={sw}
            strokeLinejoin="round"
          />
        </>
      )}
      {name === 'profile' && (
        <>
          <Circle cx={12} cy={8} r={4} stroke={color} strokeWidth={sw} />
          <Path
            d="M5 20c0-3.9 3.1-7 7-7s7 3.1 7 7"
            stroke={color}
            strokeWidth={sw}
            strokeLinecap="round"
          />
        </>
      )}
    </Svg>
  );
}
