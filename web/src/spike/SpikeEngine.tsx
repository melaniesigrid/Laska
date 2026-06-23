// SSG spike real test: imports the raw-TS rules engine from ../../src/index.ts
// and renders a value derived from it, so prerender must execute the engine.
import { createInitialState, legalMoves } from '../../../src/index.ts';

const state = createInitialState();
const moveCount = legalMoves(state).length;

export function SpikeEngine() {
  return (
    <main>
      <h1>SPIKE_ENGINE_MARKER</h1>
      <p>
        Initial position legal-move count from the engine:{' '}
        <span data-testid="move-count">ENGINE_MOVES={moveCount}</span>
      </p>
    </main>
  );
}
