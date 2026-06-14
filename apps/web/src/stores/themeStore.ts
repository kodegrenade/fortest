import { create } from 'zustand';

type ThemeChoice = 'light' | 'dark' | 'system';
type ResolvedTheme = 'light' | 'dark';
export type SubThemeChoice = 'default' | 'dracula' | 'cyberpunk' | 'nord' | 'monokai';

interface ThemeState {
  theme: ThemeChoice;
  resolvedTheme: ResolvedTheme;
  subTheme: SubThemeChoice;
  setTheme: (theme: ThemeChoice) => void;
  setSubTheme: (subTheme: SubThemeChoice) => void;
  toggleTheme: () => void;
  /** Call once on app mount to hydrate from localStorage and bind listeners */
  init: () => () => void;
}

const STORAGE_KEY = 'fortest-theme';
const SUB_THEME_STORAGE_KEY = 'fortest-sub-theme';
const CYCLE: ThemeChoice[] = ['system', 'dark', 'light'];

function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

function resolveTheme(choice: ThemeChoice): ResolvedTheme {
  return choice === 'system' ? getSystemTheme() : choice;
}

function applyTheme(resolved: ResolvedTheme): void {
  document.documentElement.setAttribute('data-theme', resolved);
}

function applySubTheme(subTheme: SubThemeChoice): void {
  document.documentElement.setAttribute('data-sub-theme', subTheme);
}

function readStoredTheme(): ThemeChoice {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') {
      return stored;
    }
  } catch {
    // localStorage may be unavailable
  }
  return 'system';
}

function readStoredSubTheme(): SubThemeChoice {
  try {
    const stored = localStorage.getItem(SUB_THEME_STORAGE_KEY);
    if (
      stored === 'default' ||
      stored === 'dracula' ||
      stored === 'cyberpunk' ||
      stored === 'nord' ||
      stored === 'monokai'
    ) {
      return stored;
    }
  } catch {
    // localStorage may be unavailable
  }
  return 'default';
}

function persistTheme(choice: ThemeChoice): void {
  try {
    localStorage.setItem(STORAGE_KEY, choice);
  } catch {
    // Silently fail if storage is unavailable
  }
}

function persistSubTheme(choice: SubThemeChoice): void {
  try {
    localStorage.setItem(SUB_THEME_STORAGE_KEY, choice);
  } catch {
    // Silently fail if storage is unavailable
  }
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: 'system',
  resolvedTheme: 'dark',
  subTheme: 'default',

  setTheme: (theme) => {
    const resolved = resolveTheme(theme);
    applyTheme(resolved);
    persistTheme(theme);
    set({ theme, resolvedTheme: resolved });
  },

  setSubTheme: (subTheme) => {
    applySubTheme(subTheme);
    persistSubTheme(subTheme);
    set({ subTheme });
  },

  toggleTheme: () => {
    const current = get().theme;
    const idx = CYCLE.indexOf(current);
    const next = CYCLE[(idx + 1) % CYCLE.length]!;
    get().setTheme(next);
  },

  init: () => {
    const stored = readStoredTheme();
    const resolved = resolveTheme(stored);
    applyTheme(resolved);

    const storedSubTheme = readStoredSubTheme();
    applySubTheme(storedSubTheme);

    set({ theme: stored, resolvedTheme: resolved, subTheme: storedSubTheme });

    // Listen for system preference changes
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      const { theme } = get();
      if (theme === 'system') {
        const newResolved = getSystemTheme();
        applyTheme(newResolved);
        set({ resolvedTheme: newResolved });
      }
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  },
}));
