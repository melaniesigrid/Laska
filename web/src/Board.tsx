import type { Board, Column, PlayerColor } from '../../src/index.ts';
import type { CSSProperties } from 'react';

interface BoardViewProps {
  board: Board;
  dim: number;
  rcToSquare: number[];
  selected: number | null;
  movable: Set<number>;
  destinations: Set<number>;
  onSquareClick: (square: number) => void;
  interactive: boolean;
  /** Side to move — colors the legal-move / forced-capture rings. Optional. */
  activeColor?: PlayerColor;
  /** True when every legal move is a capture (Laska forces captures). Optional. */
  mustCapture?: boolean;
  /** Destination squares that are captures (stronger affordance). Optional. */
  captureTargets?: Set<number>;
}

const COLOR_WORD: Record<PlayerColor, string> = { W: 'White', B: 'Black' };
/** Team -> disc body class. W reads as tiffany, B as purple (see palette). */
const TEAM_CLASS: Record<PlayerColor, string> = { W: 'tiffany', B: 'purple' };

const EMPTY = new Set<number>();

/** Human-readable description of a column, bottom -> top, for aria-labels. */
function describeColumn(col: Column): string {
  const parts = col.map((p) => `${COLOR_WORD[p.color]} ${p.rank}`);
  const commander = col[col.length - 1]!;
  return `Column of ${col.length}: ${parts.join(', then ')} on top (controlled by ${
    COLOR_WORD[commander.color]
  }).`;
}

/**
 * A column drawn top-down: each captured disc beneath the commander peeks out as
 * a thin crescent rim (shaded "deep" color), and the commander sits fully on top
 * carrying its center pip. Spacing compresses for tall columns so none is hidden.
 */
function ColumnView({ col }: { col: Column }) {
  const top = col.length - 1;
  // Compress the peek for tall columns so the stack stays inside the well.
  const peek = Math.max(4, Math.min(8, 40 / col.length));
  return (
    <span
      className="column"
      style={{ '--peek': `${peek}px` } as CSSProperties}
      aria-label={describeColumn(col)}
      role="img"
    >
      {col.map((piece, i) => {
        const isCommander = i === top;
        const fromTop = top - i; // 0 = commander, grows downward into the stack
        const cls = [
          'disc',
          TEAM_CLASS[piece.color],
          isCommander ? 'commander' : 'trapped',
          isCommander && piece.rank === 'officer' ? 'officer' : '',
        ]
          .filter(Boolean)
          .join(' ');
        return (
          <span key={i} className={cls} style={{ '--from-top': fromTop } as CSSProperties} aria-hidden="true">
            {isCommander && <span className="pip" aria-hidden="true" />}
          </span>
        );
      })}
      {col.length > 1 && (
        <span className="height-badge" aria-hidden="true">
          {col.length}
        </span>
      )}
    </span>
  );
}

export function BoardView(props: BoardViewProps) {
  const {
    board,
    dim,
    rcToSquare,
    selected,
    movable,
    destinations,
    onSquareClick,
    interactive,
    activeColor,
    mustCapture = false,
    captureTargets = EMPTY,
  } = props;

  // Active-team accent for legal/forced rings, set once on the board root.
  const activeTeam =
    activeColor === 'W'
      ? 'var(--piece-tiffany)'
      : activeColor === 'B'
        ? 'var(--piece-purple)'
        : 'var(--ambient)';

  const rows = [];
  let revealIndex = 0; // drives the staggered load animation
  // Board row 0 is White's home; render it at the bottom (display row dim-1).
  for (let displayRow = 0; displayRow < dim; displayRow++) {
    const boardRow = dim - 1 - displayRow;
    const cells = [];
    for (let col = 0; col < dim; col++) {
      const sq = rcToSquare[boardRow * dim + col]!;
      const isPlaying = sq !== -1;
      if (!isPlaying) {
        cells.push(<div key={col} className="cell void" aria-hidden="true" />);
        continue;
      }
      const column = board[sq] ?? null;
      const classes = ['cell', 'play'];
      if (selected === sq) classes.push('selected');
      if (destinations.has(sq)) classes.push('destination');
      if (captureTargets.has(sq)) classes.push('capture');
      if (interactive && movable.has(sq)) classes.push(mustCapture ? 'movable forced' : 'movable');

      const cellStyle = { '--reveal': revealIndex } as CSSProperties;
      if (column) revealIndex += 1;

      cells.push(
        <button
          key={col}
          type="button"
          className={classes.join(' ')}
          style={cellStyle}
          onClick={() => onSquareClick(sq)}
          disabled={!interactive}
          aria-label={
            column
              ? describeColumn(column)
              : `Empty square${destinations.has(sq) ? ', legal move' : ''}`
          }
        >
          <span className="well" aria-hidden="true" />
          {column && <ColumnView col={column} />}
          {destinations.has(sq) && !column && <span className="target" aria-hidden="true" />}
        </button>,
      );
    }
    rows.push(
      <div key={displayRow} className="board-row">
        {cells}
      </div>,
    );
  }

  return (
    <div className="board" style={{ '--active-team': activeTeam } as CSSProperties} role="grid" aria-label="Laska board, 7 by 7">
      <div className="board-grain" aria-hidden="true" />
      {rows}
    </div>
  );
}
