const REFRESH_KEY = 'society-erp:refresh';
const THEME_KEY = 'society-erp:theme';
const SIDEBAR_KEY = 'society-erp:sidebar';

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* storage unavailable (private mode) */
  }
}

export const tokenStorage = {
  getRefresh: () => safeGet(REFRESH_KEY),
  setRefresh: (token: string | null) => safeSet(REFRESH_KEY, token),
  clear: () => safeSet(REFRESH_KEY, null),
};

export type Theme = 'light' | 'dark' | 'system';
export const themeStorage = {
  get: (): Theme => (safeGet(THEME_KEY) as Theme) || 'system',
  set: (theme: Theme) => safeSet(THEME_KEY, theme),
};

export const sidebarStorage = {
  get: (): boolean => safeGet(SIDEBAR_KEY) === 'collapsed',
  set: (collapsed: boolean) => safeSet(SIDEBAR_KEY, collapsed ? 'collapsed' : 'expanded'),
};
