import React, { createContext, useContext, useMemo, useState } from 'react';
import { PALETTES, PaletteName, Palette, STONE } from './tokens';

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

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // v1 ships Stone; the setter exists so a palette switcher can land later
  // (persist the choice to AsyncStorage at that point — see storage/prefs).
  const [name, setName] = useState<PaletteName>('stone');
  const value = useMemo<ThemeContextValue>(
    () => ({ palette: PALETTES[name], name, setPalette: setName }),
    [name],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
