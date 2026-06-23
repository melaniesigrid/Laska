// SSG spike control route: pure static content, no engine import.
import React from 'react';

export function SpikePlain() {
  return (
    <main>
      <h1>SPIKE_PLAIN_MARKER</h1>
      <p>Static control route — proves vite-react-ssg prerenders at all.</p>
    </main>
  );
}
