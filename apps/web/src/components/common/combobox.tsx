import * as React from 'react';
import { Check, ChevronsUpDown, Loader2, X } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export interface ComboboxOption {
  value: string;
  label: string;
  description?: string;
}

/** Searchable single-select. Supports async option loading through `onSearch`. */
export function Combobox({ value, onChange, options, placeholder = 'Select…', searchPlaceholder = 'Search…', onSearch, loading, emptyText = 'No results', className, disabled, clearable = true, invalid }: { value: string | null | undefined; onChange: (value: string | null, option?: ComboboxOption) => void; options: ComboboxOption[]; placeholder?: string; searchPlaceholder?: string; onSearch?: (query: string) => void; loading?: boolean; emptyText?: string; className?: string; disabled?: boolean; clearable?: boolean; invalid?: boolean }) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const selected = options.find((o) => o.value === value);
  const filtered = onSearch ? options : options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()) || o.description?.toLowerCase().includes(query.toLowerCase()));
  React.useEffect(() => {
    if (onSearch) onSearch(query);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" role="combobox" aria-expanded={open} disabled={disabled} className={cn('w-full justify-between font-normal', !selected && 'text-muted-foreground', invalid && 'border-destructive', className)}>
          <span className="truncate">{selected?.label ?? placeholder}</span>
          <span className="flex items-center gap-1">
            {clearable && selected ? (
              <X
                className="h-3.5 w-3.5 opacity-60 hover:opacity-100"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(null);
                }}
              />
            ) : null}
            <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <div className="border-b p-2">
          <Input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder={searchPlaceholder} className="h-8" />
        </div>
        <ul className="max-h-64 overflow-y-auto p-1" role="listbox">
          {loading ? (
            <li className="flex items-center justify-center gap-2 p-3 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Loading…
            </li>
          ) : filtered.length === 0 ? (
            <li className="p-3 text-center text-xs text-muted-foreground">{emptyText}</li>
          ) : (
            filtered.map((o) => (
              <li
                key={o.value}
                role="option"
                aria-selected={o.value === value}
                className={cn('flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent', o.value === value && 'bg-accent')}
                onClick={() => {
                  onChange(o.value, o);
                  setOpen(false);
                  setQuery('');
                }}
              >
                <Check className={cn('h-4 w-4', o.value === value ? 'opacity-100' : 'opacity-0')} />
                <span className="flex-1 truncate">
                  {o.label}
                  {o.description ? <span className="ml-1 text-xs text-muted-foreground">{o.description}</span> : null}
                </span>
              </li>
            ))
          )}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
