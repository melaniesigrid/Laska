import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { PALETTES, PaletteName, Palette, STONE } from './tokens';
import { getPref, setPref } from '../storage/prefs.ts';

interface ThemeContextValue {
  palette: Palette;
  name: PaletteName;
  setPalette: (n: PaletteName) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  palette: STONE,
  name: 'stone',
  setPalette: () => {},
});

const THEME_KEY = 'laska-theme';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [name, setName] = useState<PaletteName>('stone');

  // Restore the saved palette on mount (the web persists to `laska-theme` too).
  useEffect(() => {
    let alive = true;
    getPref<PaletteName>(THEME_KEY, 'stone').then((saved) => {
      if (alive && saved in PALETTES) setName(saved);
    });
    return () => {
      alive = false;
    };
  }, []);

  const setPalette = (n: PaletteName) => {
    setName(n);
    void setPref(THEME_KEY, n);
  };

  const value = useMemo<ThemeContextValue>(
    () => ({ palette: PALETTES[name], name, setPalette }),
    [name],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
