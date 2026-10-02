import { useCallback } from 'react';
import type { Locale } from '@society-erp/shared';
import { useUiStore } from '@/stores/ui.store';
import { en, type MessageKey } from './en';
import { hi } from './hi';
import { gu } from './gu';

export type { MessageKey };

export const MESSAGES: Record<Locale, Record<MessageKey, string>> = { en, hi, gu };

/** `t('pricing.trial', { days: 14 })` → "14-day free trial"; a key missing from a language falls back to English. */
export function translate(locale: Locale, key: MessageKey, vars?: Record<string, string | number>): string {
  const template = MESSAGES[locale]?.[key] ?? en[key] ?? key;
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, name: string) => (name in vars ? String(vars[name]) : `{${name}}`));
}

/** Translation hook bound to the current website language. */
export function useT() {
  const locale = useUiStore((s) => s.locale);
  const t = useCallback((key: MessageKey, vars?: Record<string, string | number>) => translate(locale, key, vars), [locale]);
  return { t, locale };
}
