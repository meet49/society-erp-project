import { create } from 'zustand';
import { sidebarStorage, themeStorage, type Theme } from '@/lib/storage';

interface UiState {
  theme: Theme;
  sidebarCollapsed: boolean;
  mobileNavOpen: boolean;
  online: boolean;
  setTheme: (theme: Theme) => void;
  toggleSidebar: () => void;
  setMobileNav: (open: boolean) => void;
  setOnline: (online: boolean) => void;
}

function applyTheme(theme: Theme): void {
  const dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
}

export const useUiStore = create<UiState>((set, get) => ({
  theme: themeStorage.get(),
  sidebarCollapsed: sidebarStorage.get(),
  mobileNavOpen: false,
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  setTheme: (theme) => {
    themeStorage.set(theme);
    applyTheme(theme);
    set({ theme });
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
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (useUiStore.getState().theme === 'system') applyTheme('system');
  });
  window.addEventListener('online', () => useUiStore.getState().setOnline(true));
  window.addEventListener('offline', () => useUiStore.getState().setOnline(false));
}
