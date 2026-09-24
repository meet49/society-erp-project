import * as React from 'react';
import { Controller, type Control, type FieldPath, type FieldValues, type UseFormReturn } from 'react-hook-form';
import { Label } from '@/components/ui/label';
import { Input, type InputProps } from '@/components/ui/input';
import { Textarea, type TextareaProps } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { isApiError } from '@/lib/api-client';

export function FormField({ label, htmlFor, error, hint, required, className, children }: { label?: React.ReactNode; htmlFor?: string; error?: string; hint?: React.ReactNode; required?: boolean; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn('space-y-1.5', className)}>
      {label ? (
        <Label htmlFor={htmlFor} className={cn(error && 'text-destructive')}>
          {label}
          {required ? <span className="ml-0.5 text-destructive">*</span> : null}
        </Label>
      ) : null}
      {children}
      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

type Named<T extends FieldValues> = { control: Control<T>; name: FieldPath<T>; label?: React.ReactNode; hint?: React.ReactNode; required?: boolean; className?: string };

export function TextField<T extends FieldValues>({ control, name, label, hint, required, className, ...input }: Named<T> & Omit<InputProps, 'name'>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <FormField label={label} htmlFor={name} error={fieldState.error?.message} hint={hint} required={required} className={className}>
          <Input id={name} {...input} {...field} value={field.value ?? ''} invalid={Boolean(fieldState.error)} />
        </FormField>
      )}
    />
  );
}

export function TextareaField<T extends FieldValues>({ control, name, label, hint, required, className, ...input }: Named<T> & Omit<TextareaProps, 'name'>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <FormField label={label} htmlFor={name} error={fieldState.error?.message} hint={hint} required={required} className={className}>
          <Textarea id={name} {...input} {...field} value={field.value ?? ''} invalid={Boolean(fieldState.error)} />
        </FormField>
      )}
    />
  );
}

export function SelectField<T extends FieldValues>({ control, name, label, hint, required, className, options, placeholder = 'Select…', disabled }: Named<T> & { options: { value: string; label: string; disabled?: boolean }[]; placeholder?: string; disabled?: boolean }) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <FormField label={label} htmlFor={name} error={fieldState.error?.message} hint={hint} required={required} className={className}>
          <Select value={field.value ? String(field.value) : ''} onValueChange={field.onChange} disabled={disabled}>
            <SelectTrigger id={name} invalid={Boolean(fieldState.error)}>
              <SelectValue placeholder={placeholder} />
            </SelectTrigger>
            <SelectContent>
              {options.map((o) => (
                <SelectItem key={o.value} value={o.value} disabled={o.disabled}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
      )}
    />
  );
}

export function SwitchField<T extends FieldValues>({ control, name, label, hint, className, description }: Named<T> & { description?: React.ReactNode }) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <div className={cn('flex items-start justify-between gap-4 rounded-lg border p-3', className)}>
          <div className="space-y-0.5">
            <Label htmlFor={name}>{label}</Label>
            {description ?? hint ? <p className="text-xs text-muted-foreground">{description ?? hint}</p> : null}
          </div>
          <Switch id={name} checked={Boolean(field.value)} onCheckedChange={field.onChange} />
        </div>
      )}
    />
  );
}

export function CheckboxField<T extends FieldValues>({ control, name, label, hint, className }: Named<T>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <div className={cn('space-y-1', className)}>
          <label className="flex items-start gap-2 text-sm">
            <Checkbox checked={Boolean(field.value)} onCheckedChange={(v) => field.onChange(v === true)} className="mt-0.5" />
            <span>{label}</span>
          </label>
          {fieldState.error ? <p className="text-xs text-destructive">{fieldState.error.message}</p> : hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
        </div>
      )}
    />
  );
}

/** Maps API validation errors (fields) onto react-hook-form. Returns true when at least one field matched. */
export function applyServerErrors<T extends FieldValues>(form: UseFormReturn<T>, err: unknown): boolean {
  if (!isApiError(err) || !err.fields) return false;
  let matched = false;
  for (const [path, messages] of Object.entries(err.fields)) {
    if (path === '_') continue;
    form.setError(path as FieldPath<T>, { type: 'server', message: messages[0] });
    matched = true;
  }
  return matched;
}

export function FormSection({ title, description, children, className }: { title: string; description?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-lg border bg-card p-5', className)}>
      <div className="mb-4">
        <h3 className="text-sm font-semibold">{title}</h3>
        {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}
