import { Check, Languages } from 'lucide-react';
import { LOCALE_LABELS, SUPPORTED_LOCALES, type Locale } from '@society-erp/shared';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useUiStore } from '@/stores/ui.store';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';

/**
 * Language menu for the public website. `enabled` comes from the `landing.locales` platform setting,
 * so the platform owner decides which languages are offered; until settings load, all supported ones show.
 */
export function LanguageSwitcher({ enabled, variant = 'ghost', className }: { enabled?: readonly string[]; variant?: 'ghost' | 'outline'; className?: string }) {
  const locale = useUiStore((s) => s.locale);
  const setLocale = useUiStore((s) => s.setLocale);
  const { t } = useT();
  const options = SUPPORTED_LOCALES.filter((l) => !enabled || enabled.includes(l));
  if (options.length <= 1) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={variant} size="sm" className={cn('gap-1.5 px-2.5', className)} aria-label={t('nav.language')} data-testid="language-switcher">
          <Languages />
          <span className="text-sm">{LOCALE_LABELS[locale].native}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-40">
        {options.map((l: Locale) => (
          <DropdownMenuItem key={l} onClick={() => setLocale(l)} className="justify-between" lang={l}>
            <span>
              {LOCALE_LABELS[l].native}
              {l !== 'en' ? <span className="ml-1.5 text-xs text-muted-foreground">{LOCALE_LABELS[l].english}</span> : null}
            </span>
            {l === locale ? <Check className="h-4 w-4 text-primary" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
