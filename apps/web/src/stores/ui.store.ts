import { create } from 'zustand';
import { SUPPORTED_LOCALES, type Locale } from '@society-erp/shared';
import { localeStorage, sidebarStorage, themeStorage, type Theme } from '@/lib/storage';

interface UiState {
  theme: Theme;
  /** Language of the public website (and of any screen that opts in through useT). */
  locale: Locale;
  sidebarCollapsed: boolean;
  mobileNavOpen: boolean;
  online: boolean;
  setTheme: (theme: Theme) => void;
  setLocale: (locale: Locale) => void;
  toggleSidebar: () => void;
  setMobileNav: (open: boolean) => void;
  setOnline: (online: boolean) => void;
}

function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

/** Saved choice first, then the browser language if we support it, else English. `hi-IN` → `hi`. */
export function initialLocale(): Locale {
  const saved = localeStorage.get();
  if (isLocale(saved)) return saved;
  const nav = typeof navigator === 'undefined' ? '' : (navigator.language ?? '').toLowerCase().split('-')[0];
  return isLocale(nav) ? nav : 'en';
}

function applyLocale(locale: Locale): void {
  document.documentElement.lang = locale;
}

function applyTheme(theme: Theme): void {
  const dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
}

export const useUiStore = create<UiState>((set, get) => ({
  theme: themeStorage.get(),
  locale: initialLocale(),
  sidebarCollapsed: sidebarStorage.get(),
  mobileNavOpen: false,
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  setTheme: (theme) => {
    themeStorage.set(theme);
    applyTheme(theme);
    set({ theme });
  },
  setLocale: (locale) => {
    if (!isLocale(locale)) return;
    localeStorage.set(locale);
    applyLocale(locale);
    set({ locale });
  },
  toggleSidebar: () => {
    const next = !get().sidebarCollapsed;
    sidebarStorage.set(next);
    set({ sidebarCollapsed: next });
  },
  setMobileNav: (open) => set({ mobileNavOpen: open }),
  setOnline: (online) => set({ online }),
}));

if (typeof window !== 'undefined') {
  applyTheme(useUiStore.getState().theme);
  applyLocale(useUiStore.getState().locale);
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (useUiStore.getState().theme === 'system') applyTheme('system');
  });
  window.addEventListener('online', () => useUiStore.getState().setOnline(true));
  window.addEventListener('offline', () => useUiStore.getState().setOnline(false));
}
