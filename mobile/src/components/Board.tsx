/**
 * The Laska board — a faithful port of the web's neumorphism (../../web/src/styles.css).
 *
 * Three sculpted layers (web `.board` → `.field` → `.sq`):
 *   1. a RAISED panel (outer View, dual-shadow boxShadow) the board lifts on;
 *   2. a RECESSED field tray (inner View, inset boxShadow) the squares sink into;
 *   3. the 7×7 grid + coins, drawn in one SVG.
 *
 * Coins are beveled with an SVG radial gradient + a contact shadow, and the rank
 * insignia is DEBOSSED (coin-tone fill with an opposed bevel, never a painted-on
 * white mark — DESIGN.md). Signals use the single accent colour: selected column,
 * legal-move targets, last move.
 *
 * Board geometry comes from the SHARED engine. Display row is inverted so White's
 * home (engine row 0) sits at the BOTTOM, matching the web (CLAUDE.md: display
 * row 0 is the TOP). `size` is the OUTER panel edge; the playing field is inset
 * by the panel + tray padding.
 */
import React, { useEffect, useMemo, useRef } from 'react';
import { View, StyleSheet, Animated, Easing } from 'react-native';
import Svg, {
  Defs,
  RadialGradient,
  Stop,
  Rect,
  Circle,
  Ellipse,
  G,
  Polygon,
  Text as SvgText,
} from 'react-native-svg';
import {
  LASKA,
  commander,
  type Board as BoardModel,
  type Variant,
} from '../engine/index.ts';
import { raised, inset } from '../theme/neumorphic.ts';
import { rgba, radius as tokenRadius, type Palette } from '../theme/tokens.ts';

interface BoardProps {
  board: BoardModel;
  selected: number | null;
  targets: number[];
  palette: Palette;
  /** Outer panel edge length in px. */
  size: number;
  onTapSquare: (square: number) => void;
  /** Rotate 180° so Black sees their home nearest them (online play). */
  flip?: boolean;
  /** Highlight the most recent move's from/to squares. */
  lastMove?: { from: number; to: number } | null;
  /** The variant whose geometry sizes the board (7×7 Laska by default, 8×8 Bashni). */
  variant?: Variant;
}

// Animatable SVG group — lets the moved column glide to its landing square.
const AnimatedG = Animated.createAnimatedComponent(G);

function starPoints(cx: number, cy: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * 0.45;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    pts.push(`${cx + rad * Math.cos(a)},${cy + rad * Math.sin(a)}`);
  }
  return pts.join(' ');
}

export function Board({
  board,
  selected,
  targets,
  palette,
  size,
  onTapSquare,
  flip = false,
  lastMove = null,
  variant = LASKA,
}: BoardProps) {
  // Geometry comes from the variant: 7×7/25 (Laska) or 8×8/32 (Bashni). Aliased to
  // the original constant names so the drawing code below is unchanged.
  const BOARD_DIM = variant.boardDim;
  const RC_TO_SQUARE = variant.rcToSquare;
  const SQUARE_TO_RC = variant.squareToRc;
  // Sculpting paddings: the panel lifts the whole board, the tray sinks the field.
  const panelPad = Math.round(size * 0.05);
  const trayPad = Math.round(size * 0.035);
  const fieldSize = size - 2 * (panelPad + trayPad);
  const cell = fieldSize / BOARD_DIM;
  const targetSet = useMemo(() => new Set(targets), [targets]);

  const toDisplayRow = (row: number) => (flip ? row : BOARD_DIM - 1 - row);
  const toDisplayCol = (col: number) => (flip ? BOARD_DIM - 1 - col : col);
  const fromDisplay = toDisplayRow;

  // Touch coords are relative to the field View (which wraps the SVG), so they
  // map straight onto the SVG coordinate space.
  const hitTest = (x: number, y: number): number | null => {
    const dCol = Math.floor(x / cell);
    const dRow = Math.floor(y / cell);
    if (dCol < 0 || dCol >= BOARD_DIM || dRow < 0 || dRow >= BOARD_DIM) return null;
    const row = fromDisplay(dRow);
    const col = flip ? BOARD_DIM - 1 - dCol : dCol;
    const idx = RC_TO_SQUARE[row * BOARD_DIM + col];
    return idx != null && idx >= 0 ? idx : null;
  };

  const coinR = cell * 0.34;
  const peek = cell * 0.11;
  const sqInset = Math.max(1.5, cell * 0.04);

  // Move glide: the column that just landed slides from its origin square to the
  // destination over ~240ms, so pieces settle instead of teleporting. Keyed on
  // the move so it fires once per move; no-op when lastMove is null.
  const slide = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const moveKey = lastMove ? `${lastMove.from}-${lastMove.to}` : null;
  const center = (sq: number) => {
    const rc = SQUARE_TO_RC[sq];
    if (!rc) return null;
    return { x: toDisplayCol(rc.col) * cell + cell / 2, y: toDisplayRow(rc.row) * cell + cell / 2 };
  };
  useEffect(() => {
    if (!lastMove) return;
    const from = center(lastMove.from);
    const to = center(lastMove.to);
    if (!from || !to) return;
    slide.setValue({ x: from.x - to.x, y: from.y - to.y });
    const anim = Animated.timing(slide, {
      toValue: { x: 0, y: 0 },
      duration: 240,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false, // SVG props can't use the native driver
    });
    anim.start();
    return () => anim.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moveKey]);

  return (
    <View style={[styles.panel, raised(palette, 9), { width: size, height: size, padding: panelPad }]}>
      <View
        style={[
          styles.tray,
          inset(palette, 6),
          { padding: trayPad, borderRadius: Math.round(cell * 0.34) },
        ]}
      >
        <View
          style={{ width: fieldSize, height: fieldSize }}
          onStartShouldSetResponder={() => true}
          onResponderRelease={(e) => {
            const { locationX, locationY } = e.nativeEvent;
            const sq = hitTest(locationX, locationY);
            if (sq != null) onTapSquare(sq);
          }}
        >
          <Svg width={fieldSize} height={fieldSize}>
            <Defs>
              <RadialGradient id="coinCream" cx="32%" cy="28%" r="75%">
                <Stop offset="0%" stopColor={palette.cream} stopOpacity={1} />
                <Stop offset="100%" stopColor={shade(palette.cream, 0.9)} stopOpacity={1} />
              </RadialGradient>
              <RadialGradient id="coinRose" cx="32%" cy="28%" r="75%">
                <Stop offset="0%" stopColor={tint(palette.rose, 0.18)} stopOpacity={1} />
                <Stop offset="100%" stopColor={palette.rose} stopOpacity={1} />
              </RadialGradient>
            </Defs>

            {/* squares */}
            {Array.from({ length: BOARD_DIM * BOARD_DIM }).map((_, i) => {
              const row = Math.floor(i / BOARD_DIM);
              const col = i % BOARD_DIM;
              const x = toDisplayCol(col) * cell;
              const y = toDisplayRow(row) * cell;
              const idx = RC_TO_SQUARE[row * BOARD_DIM + col];
              const playable = idx != null && idx >= 0;
              if (!playable) return null; // non-playable squares are just tray surface
              const isSelected = idx === selected;
              const isTarget = targetSet.has(idx!);
              const isLast = lastMove != null && (idx === lastMove.from || idx === lastMove.to);
              const rx = cell * 0.18;
              return (
                <G key={i}>
                  {/* recessed cell: base fill + bevel (dark top-left edge, light bottom-right) */}
                  <Rect
                    x={x + 2}
                    y={y + 2}
                    width={cell - 4}
                    height={cell - 4}
                    rx={rx}
                    fill={palette.sqDark}
                  />
                  <Rect
                    x={x + 2}
                    y={y + 2}
                    width={cell - 4}
                    height={cell - 4}
                    rx={rx}
                    fill="none"
                    stroke={palette.sqLo}
                    strokeWidth={sqInset}
                    strokeOpacity={0.55}
                  />
                  <Rect
                    x={x + 2 + sqInset * 0.5}
                    y={y + 2 + sqInset * 0.5}
                    width={cell - 4 - sqInset}
                    height={cell - 4 - sqInset}
                    rx={rx}
                    fill="none"
                    stroke={palette.sqHi}
                    strokeWidth={sqInset * 0.7}
                    strokeOpacity={0.5}
                  />
                  {/* signal ring */}
                  {(isSelected || isTarget || isLast) && (
                    <Rect
                      x={x + 3}
                      y={y + 3}
                      width={cell - 6}
                      height={cell - 6}
                      rx={rx}
                      fill="none"
                      stroke={palette.accent}
                      strokeWidth={isSelected ? 3 : isTarget ? 2.5 : 2}
                      strokeOpacity={isSelected ? 1 : isTarget ? 0.85 : 0.4}
                    />
                  )}
                </G>
              );
            })}

            {/* columns (stacks of coins) */}
            {board.map((column, idx) => {
              if (!column || column.length === 0) return null;
              const rc = SQUARE_TO_RC[idx];
              if (!rc) return null;
              const cx = toDisplayCol(rc.col) * cell + cell / 2;
              const baseCy = toDisplayRow(rc.row) * cell + cell / 2;
              const top = commander(column)!;
              const height = (column.length - 1) * peek;
              const isMoving = lastMove != null && idx === lastMove.to;
              const Wrapper = isMoving ? AnimatedG : G;
              // Animated x/y aren't in react-native-svg's static types; cast.
              const wrapperProps = isMoving
                ? ({ x: slide.x, y: slide.y } as unknown as { x: number; y: number })
                : {};
              return (
                <Wrapper key={`col-${idx}`} {...wrapperProps}>
                  {column.map((piece, depth) => {
                    const cy = baseCy + height / 2 - depth * peek;
                    const isWhite = piece.color === 'W';
                    const isTop = depth === column.length - 1;
                    return (
                      <G key={depth} opacity={isTop ? 1 : 0.97}>
                        {/* contact shadow */}
                        <Ellipse
                          cx={cx + coinR * 0.06}
                          cy={cy + coinR * 0.16}
                          rx={coinR}
                          ry={coinR}
                          fill={rgba(palette.castRGB, 0.22)}
                        />
                        {/* coin body */}
                        <Circle cx={cx} cy={cy} r={coinR} fill={isWhite ? 'url(#coinCream)' : 'url(#coinRose)'} />
                        {/* top-left lip highlight */}
                        <Ellipse
                          cx={cx - coinR * 0.28}
                          cy={cy - coinR * 0.34}
                          rx={coinR * 0.42}
                          ry={coinR * 0.3}
                          fill="rgba(255,255,255,0.28)"
                        />
                        {/* rim */}
                        <Circle
                          cx={cx}
                          cy={cy}
                          r={coinR}
                          fill="none"
                          stroke={isWhite ? shade(palette.cream, 0.82) : rgba(palette.castRGB, 0.5)}
                          strokeWidth={0.75}
                        />
                        {isTop && <Insignia cx={cx} cy={cy} r={coinR} officer={top.rank === 'officer'} white={isWhite} palette={palette} />}
                      </G>
                    );
                  })}
                  {column.length > 1 && (
                    <G>
                      <Circle
                        cx={cx + coinR * 0.72}
                        cy={baseCy - height / 2 - coinR * 0.52}
                        r={coinR * 0.44}
                        fill={palette.accent}
                      />
                      <SvgText
                        x={cx + coinR * 0.72}
                        y={baseCy - height / 2 - coinR * 0.52 + coinR * 0.2}
                        fontSize={coinR * 0.62}
                        fontWeight="600"
                        fill={contrastInk(palette, palette.accent)}
                        textAnchor="middle"
                      >
                        {column.length}
                      </SvgText>
                    </G>
                  )}
                </Wrapper>
              );
            })}
          </Svg>
        </View>
      </View>
    </View>
  );
}

/** Debossed rank mark: a dark bevel copy (top-left) + light copy (bottom-right)
 *  behind a coin-tone main shape — engraved, never painted-on (DESIGN.md). */
function Insignia({
  cx,
  cy,
  r,
  officer,
  white,
  palette,
}: {
  cx: number;
  cy: number;
  r: number;
  officer: boolean;
  white: boolean;
  palette: Palette;
}) {
  const bevelDark = white ? 'rgba(95,80,58,0.5)' : 'rgba(0,0,0,0.5)';
  const bevelLight = white ? rgba([255, 252, 246], 0.65) : 'rgba(255,255,255,0.32)';
  const main = white ? 'rgba(106,86,63,0.9)' : 'rgba(0,0,0,0.42)';
  const off = r * 0.06;

  // Only generals are marked (an engraved star); soldiers are a plain coin —
  // matching the web's Heirloom theme (../../web/src/pieceTheme.tsx).
  if (!officer) return null;
  const size = r * 0.56;
  return (
    <G>
      <Polygon points={starPoints(cx - off, cy - off, size)} fill={bevelDark} />
      <Polygon points={starPoints(cx + off, cy + off, size)} fill={bevelLight} />
      <Polygon points={starPoints(cx, cy, size)} fill={main} />
    </G>
  );
}

// --- tiny colour helpers (hex → adjusted hex), for SVG gradient stops ---
function clamp(n: number) {
  return Math.max(0, Math.min(255, Math.round(n)));
}
function parse(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function toHex([r, g, b]: [number, number, number]) {
  return `#${[r, g, b].map((n) => clamp(n).toString(16).padStart(2, '0')).join('')}`;
}
/** Darken toward black by (1-k); k=0.9 keeps 90% of each channel. */
function shade(hex: string, k: number) {
  const [r, g, b] = parse(hex);
  return toHex([r * k, g * k, b * k]);
}
/** Lighten toward white by t (0..1). */
function tint(hex: string, t: number) {
  const [r, g, b] = parse(hex);
  return toHex([r + (255 - r) * t, g + (255 - g) * t, b + (255 - b) * t]);
}
/** Pick a legible ink (the cream or the deep text) for text over `bg`. */
function contrastInk(palette: Palette, bg: string) {
  const [r, g, b] = parse(bg);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? palette.text : palette.highlight;
}

const styles = StyleSheet.create({
  panel: { borderRadius: tokenRadius.lg + 4, alignItems: 'center', justifyContent: 'center' },
  tray: { alignItems: 'center', justifyContent: 'center' },
});
