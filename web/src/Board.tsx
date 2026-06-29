import type { Board, Column, PlayerColor } from '../../src/index.ts';
import type { CSSProperties, ReactNode } from 'react';
import { LayoutGroup, motion } from 'motion/react';
import { Insignia, usePieceTheme } from './pieceTheme.tsx';
import { useCoords } from './coordsPref.ts';

/** One-shot reward feedback fired on the landing square of the last move:
 *  `tuckCount` bottom coins slide up under the cap (prisoners just taken), and
 *  `promoted` pops the freshly-crowned commander. Square-scoped + one move long,
 *  so it never replays on an unrelated re-render. */
export interface MoveFx {
  square: number;
  tuckCount: number;
  promoted: boolean;
}

interface BoardViewProps {
  board: Board;
  dim: number;
  rcToSquare: number[];
  selected: number | null;
  movable: Set<number>;
  destinations: Set<number>;
  onSquareClick: (square: number) => void;
  interactive: boolean;
  activeColor?: PlayerColor;
  mustCapture?: boolean;
  captureTargets?: Set<number>;
  /** Optional tutorial/analysis emphasis independent of legal-move signals. */
  highlight?: Set<number>;
  /** Rotate the board 180° so Black's home side is nearest the viewer. */
  flipped?: boolean;
  /** Draw file letters (a–g) along the bottom edge and rank numbers (1–7) down
   *  the left edge. Labels read off board geometry, so they stay correct when
   *  `flipped`. Omit to follow the global `useCoords()` preference (the topbar
   *  toggle); pass an explicit boolean only to force labels on/off for a surface. */
  showCoordinates?: boolean;
  /**
   * Optional stable identity per square (parallel to `board`). When supplied, a
   * column carries its id from one square to the next across a move, so Motion's
   * shared-layout transition glides it `from → to` instead of teleporting. Omit
   * for static surfaces (replay/landing) — columns then render without motion.
   */
  colIds?: (string | null)[];
  /** Reward feedback for the just-played move (tuck prisoners / promotion pop). */
  moveFx?: MoveFx | null;
  /** Optional transient overlay rendered inside the (relative) `.stage` — used
   *  for board-anchored flourishes like the multi-capture combo badge. */
  overlay?: ReactNode;
}

const COLOR_WORD: Record<PlayerColor, string> = { W: 'White', B: 'Black' };
/** Team -> coin class. White is the cream faction, Black the rose faction. */
const TEAM_CLASS: Record<PlayerColor, string> = { W: 'cream', B: 'rose' };

const EMPTY = new Set<number>();

function describeColumn(col: Column): string {
  const parts = col.map((p) => `${COLOR_WORD[p.color]} ${p.rank}`);
  const commander = col[col.length - 1]!;
  return `Column of ${col.length}: ${parts.join(', then ')} on top (controlled by ${
    COLOR_WORD[commander.color]
  }).`;
}

/**
 * A single coin. Plain by default; a `motion.span` only when it carries a
 * one-shot reward:
 *  - `tuck`: a prisoner just buried at the bottom — slides up under the cap.
 *  - `pop`:  the commander was just crowned — a quick scale pulse as the star
 *    embosses in.
 * Both fire on mount (the landing column mounts onto a vacated square), so they
 * play exactly once and never on ordinary re-renders. Under reduced motion,
 * Motion drops the transform and keeps the opacity fade — feedback survives.
 */
function DiscView({
  className, style, tuck, pop, children,
}: { className: string; style: CSSProperties; tuck: boolean; pop: boolean; children?: ReactNode }) {
  if (tuck) {
    return (
      <motion.span
        className={className}
        style={style}
        aria-hidden="true"
        initial={{ y: 10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 520, damping: 30, delay: 0.1 }}
      >
        {children}
      </motion.span>
    );
  }
  if (pop) {
    return (
      <motion.span
        className={className}
        style={style}
        aria-hidden="true"
        animate={{ scale: [1, 1.15, 1] }}
        transition={{ duration: 0.42, delay: 0.08, ease: 'easeOut' }}
      >
        {children}
      </motion.span>
    );
  }
  return (
    <span className={className} style={style} aria-hidden="true">
      {children}
    </span>
  );
}

/** A stack of coins: each piece a soft disc, commander on top with rank pips. */
function ColumnView({
  col, selected, tuckCount = 0, pop = false,
}: { col: Column; selected: boolean; tuckCount?: number; pop?: boolean }) {
  const pieceTheme = usePieceTheme();
  const n = col.length;
  const top = n - 1;
  const commander = col[top]!;
  return (
    <span
      className={`column${selected ? ' selected' : ''}`}
      style={{ height: `calc(var(--coin) + var(--peek) * ${n - 1})` } as CSSProperties}
      aria-label={describeColumn(col)}
      role="img"
    >
      {col.map((piece, i) => {
        const isTop = i === top;
        const cls = `disc ${TEAM_CLASS[piece.color]}${isTop ? ' top' : ''}`;
        return (
          <DiscView
            key={i}
            className={cls}
            style={{ bottom: `calc(var(--peek) * ${i})`, zIndex: i + 1 } as CSSProperties}
            tuck={i < tuckCount}
            pop={isTop && pop}
          >
            {isTop && pop && (
              // A celebratory accent ring blooms outward as the coin is crowned
              // (CSS-only, removed under reduced-motion — see .promo-ring).
              <span className="promo-ring" aria-hidden="true" />
            )}
            {isTop &&
              (pop ? (
                // The crowning: emboss the new general's star in as the coin pops.
                <motion.span
                  className="ins-reveal"
                  initial={{ scale: 0.2, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 460, damping: 22, delay: 0.16 }}
                >
                  <Insignia theme={pieceTheme} rank={commander.rank} />
                </motion.span>
              ) : (
                <Insignia theme={pieceTheme} rank={commander.rank} />
              ))}
          </DiscView>
        );
      })}
      {n > 1 &&
        (tuckCount > 0 ? (
          // The prisoner count ticks in as the captured coin tucks under.
          <motion.span
            className="count"
            aria-hidden="true"
            initial={{ x: '-50%', scale: 0.2, opacity: 0 }}
            animate={{ x: '-50%', scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 500, damping: 24, delay: 0.24 }}
          >
            {n}
          </motion.span>
        ) : (
          <span className="count" aria-hidden="true">
            {n}
          </span>
        ))}
    </span>
  );
}

/**
 * The signature moment: when a column carries the same `glideId` from one square
 * to the next, Motion's shared-layout transition slides it `from → to` on a
 * spring — the capturing column visibly leaps onto its prey. `layout="position"`
 * animates only the glide; the inner `.column` keeps its own CSS lift transform
 * (selection), so the two never fight. Without a `glideId`, render statically.
 */
function GlidingColumn({
  col, selected, glideId, tuckCount, pop,
}: { col: Column; selected: boolean; glideId: string | null; tuckCount: number; pop: boolean }) {
  const inner = <ColumnView col={col} selected={selected} tuckCount={tuckCount} pop={pop} />;
  if (glideId == null) return inner;
  return (
    <motion.span
      layout="position"
      layoutId={glideId}
      className="glide"
      transition={{ type: 'spring', stiffness: 620, damping: 34, mass: 0.9 }}
    >
      {inner}
    </motion.span>
  );
}

export function BoardView(props: BoardViewProps) {
  const {
    board, dim, rcToSquare, selected, movable, destinations,
    onSquareClick, interactive, mustCapture = false, captureTargets = EMPTY,
    highlight = EMPTY, flipped = false, colIds, moveFx, overlay,
  } = props;
  // No explicit prop → follow the global toggle; an explicit boolean wins.
  const coordsPref = useCoords();
  const showCoordinates = props.showCoordinates ?? coordsPref;

  const cells = [];
  // Default: White's home (board row 0) sits nearest the viewer. For Black,
  // reverse both axes — a true 180° rotation, not a vertical mirror.
  for (let displayRow = 0; displayRow < dim; displayRow++) {
    const boardRow = flipped ? displayRow : dim - 1 - displayRow;
    for (let displayCol = 0; displayCol < dim; displayCol++) {
      const boardCol = flipped ? dim - 1 - displayCol : displayCol;
      const sq = rcToSquare[boardRow * dim + boardCol]!;
      const playable = sq !== -1;
      if (!playable) {
        cells.push(<div key={`${displayRow}-${displayCol}`} className="sq light" aria-hidden="true" />);
        continue;
      }
      const column = board[sq] ?? null;
      const classes = ['sq', 'dark', 'play'];
      if (highlight.has(sq)) classes.push('highlight');
      if (destinations.has(sq)) classes.push('drop-target');
      if (captureTargets.has(sq)) classes.push('capture');
      if (interactive && movable.has(sq)) classes.push(mustCapture ? 'movable forced' : 'movable');

      cells.push(
        <button
          key={`${displayRow}-${displayCol}`}
          type="button"
          className={classes.join(' ')}
          data-square={sq}
          onClick={() => onSquareClick(sq)}
          disabled={!interactive}
          aria-label={
            column ? describeColumn(column) : `Empty square${destinations.has(sq) ? ', legal move' : ''}`
          }
        >
          <span className="holder">
            {column && (
              <GlidingColumn
                col={column}
                selected={selected === sq}
                glideId={colIds ? (colIds[sq] ?? null) : null}
                tuckCount={moveFx && moveFx.square === sq ? moveFx.tuckCount : 0}
                pop={moveFx?.square === sq ? moveFx.promoted : false}
              />
            )}
          </span>
        </button>,
      );
    }
  }

  // Coordinate gutters: rank numbers down the left edge (top→bottom display
  // order) and file letters across the bottom. Both derive from board geometry,
  // so a flip relabels them (a1 sits under whichever corner faces the viewer).
  const rankLabels = showCoordinates
    ? Array.from({ length: dim }, (_, r) => (flipped ? r : dim - 1 - r) + 1)
    : null;
  const fileLabels = showCoordinates
    ? Array.from({ length: dim }, (_, c) => String.fromCharCode(97 + (flipped ? dim - 1 - c : c)))
    : null;

  return (
    <div className="stage">
      <div className="board">
        <LayoutGroup>
          <div
            className={`field${showCoordinates ? ' with-coords' : ''}`}
            role="grid"
            aria-label={`Board, ${dim} by ${dim}, ${flipped ? 'Black' : 'White'} perspective`}
            data-perspective={flipped ? 'black' : 'white'}
            style={{
              gridTemplateColumns: `repeat(${dim}, var(--sq))`,
              gridTemplateRows: `repeat(${dim}, var(--sq))`,
            }}
          >
            {cells}
            {showCoordinates && (
              <>
                <div className="coord-ranks" aria-hidden="true" style={{ height: `calc(${dim} * var(--sq))` }}>
                  {rankLabels!.map((n, i) => <span key={i}>{n}</span>)}
                </div>
                <div className="coord-files" aria-hidden="true" style={{ width: `calc(${dim} * var(--sq))` }}>
                  {fileLabels!.map((f, i) => <span key={i}>{f}</span>)}
                </div>
              </>
            )}
          </div>
        </LayoutGroup>
      </div>
      {overlay}
    </div>
  );
}
