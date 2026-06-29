import React from 'react';
import ReactDOM from 'react-dom/client';
import { MotionConfig } from 'motion/react';
import { Analytics } from '@vercel/analytics/react';
import { App } from './App.tsx';
import { initProdAnalytics } from './analytics/prodInit.ts';
import './styles.css';

// Swap the no-op default analytics sink for the real Vercel transport — but
// only in a production build (dev stays on the console sink). Must run before
// the first track() fires; trackAppOpen runs in an App effect after mount.
initProdAnalytics();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {/* reducedMotion="user" makes every Motion animation honour the OS
        prefers-reduced-motion setting — the JS counterpart to the CSS kill
        switch at the foot of styles.css. */}
    <MotionConfig reducedMotion="user">
      <App />
      {/* Vercel Web Analytics: cookieless pageview/traffic collection. No-op
          until the project has Web Analytics enabled in the Vercel dashboard;
          product/funnel events are shipped separately by the Vercel sink. */}
      <Analytics />
    </MotionConfig>
  </React.StrictMode>,
);
