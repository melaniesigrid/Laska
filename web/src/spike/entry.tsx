// Minimal vite-react-ssg entry for the SSG de-risk spike.
import { ViteReactSSG } from 'vite-react-ssg';
import type { RouteRecord } from 'vite-react-ssg';
import { SpikePlain } from './SpikePlain.tsx';
import { SpikeEngine } from './SpikeEngine.tsx';

const routes: RouteRecord[] = [
  { path: 'spike-plain', element: <SpikePlain /> },
  { path: 'spike-engine', element: <SpikeEngine /> },
];

export const createRoot = ViteReactSSG({ routes });
