/**
 * The Laska board, rendered with react-native-svg. Faithful to DESIGN.md:
 * recessed dark playing squares, stacked coins ("columns"), commander on top
 * carrying a rank mark (Heirloom default: star = officer, pip = soldier), and a
 * count badge for stacks taller than 1. Signals use the single accent colour:
 * selected column + legal-move targets.
 *
 * Board geometry comes from the SHARED engine (SQUARE_TO_RC / RC_TO_SQUARE).
 * Display row is inverted so White's home (engine row 0) sits at the BOTTOM,
 * matching the web board (see CLAUDE.md "display row 0 is the TOP").
 *
 * Neumorphism note: SVG gives crisper coin bevels than nested Views. True inset
 * tray shadows are approximated here with a darker recessed fill; a full
 * inner-shadow pass is a polish item (see ../../MOBILE.md).
 */
import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Rect, Circle, G, Polygon, Text as SvgText } from 'react-native-svg';
import {
  SQUARE_TO_RC,
  RC_TO_SQUARE,
  BOARD_DIM,
  commander,
  type Board as BoardModel,
} from '../engine/index.ts';
import type { Palette } from '../theme/tokens';

interface BoardProps {
  board: BoardModel;
  selected: number | null;
  targets: number[];
  palette: Palette;
  /** Board edge length in px. */
  size: number;
  onTapSquare: (square: number) => void;
}

function starPoints(cx: number, cy: number, r: number): string {
  // 5-point star, pointing up.
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const radius = i % 2 === 0 ? r : r * 0.45;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    pts.push(`${cx + radius * Math.cos(a)},${cy + radius * Math.sin(a)}`);
  }
  return pts.join(' ');
}

export function Board({ board, selected, targets, palette, size, onTapSquare }: BoardProps) {
  const cell = size / BOARD_DIM;
  const targetSet = useMemo(() => new Set(targets), [targets]);

  // Map a touch (x,y) to a playable square index, or null.
  const hitTest = (x: number, y: number): number | null => {
    const col = Math.floor(x / cell);
    const displayRow = Math.floor(y / cell);
    if (col < 0 || col >= BOARD_DIM || displayRow < 0 || displayRow >= BOARD_DIM) return null;
    const row = BOARD_DIM - 1 - displayRow;
    const idx = RC_TO_SQUARE[row * BOARD_DIM + col];
    return idx != null && idx >= 0 ? idx : null;
  };

  const coinR = cell * 0.34;
  const peek = cell * 0.11;

  return (
    <View
      style={[styles.wrap, { width: size, height: size, borderRadius: cell * 0.4 }]}
      onStartShouldSetResponder={() => true}
      onResponderRelease={(e) => {
        const { locationX, locationY } = e.nativeEvent;
        const sq = hitTest(locationX, locationY);
        if (sq != null) onTapSquare(sq);
      }}
    >
      <Svg width={size} height={size}>
        {/* squares */}
        {Array.from({ length: BOARD_DIM * BOARD_DIM }).map((_, i) => {
          const row = Math.floor(i / BOARD_DIM);
          const col = i % BOARD_DIM;
          const displayRow = BOARD_DIM - 1 - row;
          const idx = RC_TO_SQUARE[row * BOARD_DIM + col];
          const playable = idx != null && idx >= 0;
          const x = col * cell;
          const y = displayRow * cell;
          const isSelected = playable && idx === selected;
          const isTarget = playable && targetSet.has(idx!);
          return (
            <Rect
              key={i}
              x={x + 1}
              y={y + 1}
              width={cell - 2}
              height={cell - 2}
              rx={cell * 0.16}
              fill={playable ? palette.shade : palette.highlight}
              stroke={isSelected || isTarget ? palette.accent : 'transparent'}
              strokeWidth={isSelected ? 3 : isTarget ? 2 : 0}
              opacity={playable ? 1 : 0.6}
            />
          );
        })}

        {/* columns (stacks of coins) */}
        {board.map((column, idx) => {
          if (!column || column.length === 0) return null;
          const rc = SQUARE_TO_RC[idx];
          if (!rc) return null;
          const displayRow = BOARD_DIM - 1 - rc.row;
          const cx = rc.col * cell + cell / 2;
          const baseCy = displayRow * cell + cell / 2;
          const top = commander(column)!;
          const height = (column.length - 1) * peek;
          return (
            <G key={`col-${idx}`}>
              {column.map((piece, depth) => {
                // bottom (depth 0) drawn lowest; commander (last) on top.
                const cy = baseCy + height / 2 - depth * peek;
                const fill = piece.color === 'W' ? palette.cream : palette.rose;
                const isTop = depth === column.length - 1;
                return (
                  <G key={depth}>
                    <Circle cx={cx} cy={cy} r={coinR} fill={fill} stroke={palette.shade} strokeWidth={1} />
                    {isTop &&
                      (top.rank === 'officer' ? (
                        <Polygon
                          points={starPoints(cx, cy, coinR * 0.55)}
                          fill={top.color === 'W' ? palette.rose : palette.cream}
                          opacity={0.85}
                        />
                      ) : (
                        <Circle cx={cx} cy={cy} r={coinR * 0.16} fill={top.color === 'W' ? palette.rose : palette.cream} opacity={0.7} />
                      ))}
                  </G>
                );
              })}
              {column.length > 1 && (
                <G>
                  <Circle cx={cx + coinR * 0.7} cy={baseCy - height / 2 - coinR * 0.5} r={coinR * 0.42} fill={palette.accent} />
                  <SvgText
                    x={cx + coinR * 0.7}
                    y={baseCy - height / 2 - coinR * 0.5 + coinR * 0.18}
                    fontSize={coinR * 0.6}
                    fill={palette.highlight}
                    textAnchor="middle"
                  >
                    {column.length}
                  </SvgText>
                </G>
              )}
            </G>
          );
        })}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden' },
});
