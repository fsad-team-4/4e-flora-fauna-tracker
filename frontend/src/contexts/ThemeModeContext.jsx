/* eslint-disable react-refresh/only-export-components -- context file exports its hook alongside the provider */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import GlobalStyles from '@mui/material/GlobalStyles';
import { createAppTheme, THEME_TOKENS } from '../theme';

const STORAGE_KEY = 'emColorScheme';
export const MODE_OPTIONS = ['light', 'dark', 'system'];

const ThemeModeContext = createContext(null);

function readStored() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return MODE_OPTIONS.includes(v) ? v : 'system';
  } catch {
    // private-mode / storage-disabled browsers: fall back to following the OS
    return 'system';
  }
}

function systemPrefersDark() {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/**
 * Colour-scheme provider.
 *
 * `mode` is the user's *preference* ('light' | 'dark' | 'system'); `resolvedMode`
 * is the scheme actually in force. Keeping them separate is what lets "system"
 * keep tracking the OS after the choice is made, instead of freezing to whatever
 * the OS happened to be at the time.
 *
 * The scheme's tokens are written as CSS custom properties on <html>, which is how
 * every existing `BRAND.*` reference re-skins without being touched.
 */
export function ThemeModeProvider({ children }) {
  const [mode, setMode] = useState(readStored);
  const [systemDark, setSystemDark] = useState(systemPrefersDark);

  // Track the OS setting for as long as the preference is 'system'.
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = e => setSystemDark(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const resolvedMode = mode === 'system' ? (systemDark ? 'dark' : 'light') : mode;

  const setModePersisted = useCallback(next => {
    if (!MODE_OPTIONS.includes(next)) return;
    setMode(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // preference just won't survive a reload; the UI still switches
    }
  }, []);

  const toggleMode = useCallback(() => {
    setModePersisted(resolvedMode === 'dark' ? 'light' : 'dark');
  }, [resolvedMode, setModePersisted]);

  // Mirror onto <html> so the attribute is available to plain CSS too, and so the
  // native scrollbars / form controls follow the scheme.
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-em-mode', resolvedMode);
    root.style.colorScheme = resolvedMode;
  }, [resolvedMode]);

  const theme = useMemo(() => createAppTheme(resolvedMode), [resolvedMode]);
  const value = useMemo(
    () => ({ mode, resolvedMode, setMode: setModePersisted, toggleMode }),
    [mode, resolvedMode, setModePersisted, toggleMode]
  );

  return (
    <ThemeModeContext.Provider value={value}>
      <ThemeProvider theme={theme}>
        <GlobalStyles styles={{ ':root': THEME_TOKENS[resolvedMode] }} />
        <CssBaseline />
        {children}
      </ThemeProvider>
    </ThemeModeContext.Provider>
  );
}

export function useThemeMode() {
  const ctx = useContext(ThemeModeContext);
  if (!ctx) throw new Error('useThemeMode must be used inside ThemeModeProvider');
  return ctx;
}
