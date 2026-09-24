import * as React from 'react';
import { UploadCloud, X, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export function FileUpload({ value, onChange, accept, multiple = false, maxSizeMb = 15, className, label = 'Drag files here or click to browse', disabled }: { value: File[]; onChange: (files: File[]) => void; accept?: string; multiple?: boolean; maxSizeMb?: number; className?: string; label?: string; disabled?: boolean }) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [dragging, setDragging] = React.useState(false);

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const incoming = Array.from(list);
    const tooBig = incoming.find((f) => f.size > maxSizeMb * 1024 * 1024);
    if (tooBig) {
      setError(`${tooBig.name} exceeds ${maxSizeMb} MB`);
      return;
    }
    setError(null);
    onChange(multiple ? [...value, ...incoming] : incoming.slice(0, 1));
  };

  return (
    <div className={className}>
      <div
        role="button"
        tabIndex={0}
        aria-disabled={disabled}
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!disabled) addFiles(e.dataTransfer.files);
        }}
        className={cn('flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground transition-colors hover:bg-muted/50', dragging && 'border-primary bg-accent', disabled && 'cursor-not-allowed opacity-60')}
      >
        <UploadCloud className="mb-2 h-6 w-6" />
        <span>{label}</span>
        <span className="mt-1 text-xs">Max {maxSizeMb} MB{accept ? ` · ${accept}` : ''}</span>
        <input ref={inputRef} type="file" className="hidden" accept={accept} multiple={multiple} disabled={disabled} onChange={(e) => addFiles(e.target.files)} />
      </div>
      {error ? <p className="mt-1 text-xs text-destructive">{error}</p> : null}
      {value.length ? (
        <ul className="mt-2 space-y-1">
          {value.map((f, i) => (
            <li key={`${f.name}-${i}`} className="flex items-center justify-between rounded-md border px-2 py-1 text-xs">
              <span className="flex items-center gap-2 truncate">
                <FileText className="h-3.5 w-3.5 shrink-0" /> {f.name} <span className="text-muted-foreground">({Math.round(f.size / 1024)} KB)</span>
              </span>
              <Button type="button" variant="ghost" size="icon-sm" onClick={() => onChange(value.filter((_, j) => j !== i))} aria-label={`Remove ${f.name}`}>
                <X />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
