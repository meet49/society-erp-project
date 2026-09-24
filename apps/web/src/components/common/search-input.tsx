import * as React from 'react';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { cn, debounce } from '@/lib/utils';

export function SearchInput({ value, onChange, placeholder = 'Search…', className, delay = 300 }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string; delay?: number }) {
  const [local, setLocal] = React.useState(value);
  React.useEffect(() => setLocal(value), [value]);
  const emit = React.useMemo(() => debounce(onChange, delay), [onChange, delay]);
  React.useEffect(() => () => emit.cancel(), [emit]);
  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
      <Input
        value={local}
        onChange={(e) => {
          setLocal(e.target.value);
          emit(e.target.value);
        }}
        placeholder={placeholder}
        className="pl-8 pr-8"
        aria-label={placeholder}
      />
      {local ? (
        <button
          type="button"
          className="absolute right-2 top-2.5 text-muted-foreground hover:text-foreground"
          onClick={() => {
            setLocal('');
            onChange('');
          }}
          aria-label="Clear search"
        >
          <X className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
}

export interface FilterOption {
  value: string;
  label: string;
}

export function FilterSelect({ value, onChange, options, placeholder = 'All', className, allLabel = 'All' }: { value: string; onChange: (v: string) => void; options: FilterOption[]; placeholder?: string; className?: string; allLabel?: string }) {
  return (
    <Select value={value || '__all__'} onValueChange={(v) => onChange(v === '__all__' ? '' : v)}>
      <SelectTrigger className={cn('h-9 w-[160px]', className)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__all__">{allLabel}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function FilterBar({ children, onReset, className }: { children: React.ReactNode; onReset?: () => void; className?: string }) {
  return (
    <div className={cn('mb-4 flex flex-wrap items-center gap-2', className)}>
      {children}
      {onReset ? (
        <Button variant="ghost" size="sm" onClick={onReset}>
          Reset
        </Button>
      ) : null}
    </div>
  );
}
