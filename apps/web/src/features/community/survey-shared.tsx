import * as React from 'react';
import { Star } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

export type Answers = Record<string, unknown>;

/** Renders one survey question as an input, driven purely by the question definition. */
export function QuestionField({ q, value, onChange, error }: { q: any; value: unknown; onChange: (v: unknown) => void; error?: string }) {
  const id = `sq-${q.key}`;
  return (
    <div className="space-y-2 rounded-md border p-4">
      <Label htmlFor={id} className="text-sm font-medium">{q.label}{q.required ? <span className="text-destructive"> *</span> : null}</Label>
      {q.help ? <p className="text-xs text-muted-foreground">{q.help}</p> : null}
      {q.type === 'TEXT' ? <Textarea id={id} rows={3} value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} /> : null}
      {q.type === 'SINGLE' || q.type === 'YES_NO' ? <div className="flex flex-wrap gap-2">{q.options.map((o: string) => <button key={o} id={o === q.options[0] ? id : undefined} type="button" onClick={() => onChange(o)} className={cn('rounded-full border px-3 py-1 text-sm', value === o ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:border-primary')}>{o}</button>)}</div> : null}
      {q.type === 'MULTIPLE' ? <div className="space-y-1">{q.options.map((o: string) => { const arr = Array.isArray(value) ? (value as string[]) : []; return <label key={o} className="flex items-center gap-2 text-sm"><Checkbox checked={arr.includes(o)} onCheckedChange={(v) => onChange(v ? [...arr, o] : arr.filter((x) => x !== o))} /> {o}</label>; })}</div> : null}
      {q.type === 'RATING' ? <div className="flex gap-1" id={id}>{Array.from({ length: q.max ?? 5 }, (_, i) => i + 1).map((n) => <button key={n} type="button" aria-label={`${n} of ${q.max ?? 5}`} onClick={() => onChange(n)} className={cn('rounded-md p-1', Number(value) >= n ? 'text-warning' : 'text-muted-foreground/40 hover:text-warning')}><Star className={cn('h-6 w-6', Number(value) >= n && 'fill-current')} /></button>)}<span className="ml-2 self-center text-xs text-muted-foreground">{value ? `${value}/${q.max ?? 5}` : ''}</span></div> : null}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

/** Aggregated results for one question. */
export function QuestionResult({ q }: { q: any }) {
  return (
    <div className="rounded-md border p-4">
      <p className="text-sm font-medium">{q.label} <span className="text-xs font-normal text-muted-foreground">· {q.answered} answered</span></p>
      {q.type === 'RATING' ? <div className="mt-2"><p className="text-2xl font-semibold">{q.average ?? '—'}<span className="text-sm text-muted-foreground"> average</span></p><ul className="mt-2 space-y-1">{q.distribution.map((d: any) => <li key={d.value} className="flex items-center gap-2 text-xs"><span className="w-4">{d.value}</span><Progress value={q.answered ? (d.count / q.answered) * 100 : 0} className="flex-1" /><span className="w-6 text-right text-muted-foreground">{d.count}</span></li>)}</ul></div> : null}
      {q.options ? <ul className="mt-2 space-y-2">{q.options.map((o: any) => <li key={o.option}><div className="flex justify-between text-sm"><span>{o.option}</span><span className="text-muted-foreground">{o.count} · {o.percent}%</span></div><Progress value={o.percent} className="mt-1" /></li>)}</ul> : null}
      {q.answers ? <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto text-sm">{q.answers.map((a: any, i: number) => <li key={i} className="rounded bg-muted/50 px-2 py-1">“{a.text}”{a.who ? <span className="text-xs text-muted-foreground"> — {a.who.name}{a.who.unitCode ? `, ${a.who.unitCode}` : ''}</span> : null}</li>)}{!q.answers.length ? <li className="text-xs text-muted-foreground">No answers yet.</li> : null}</ul> : null}
    </div>
  );
}

export function QuestionInput({ value, onChange }: { value: any; onChange: (q: any) => void }) {
  const set = (patch: Record<string, unknown>) => onChange({ ...value, ...patch });
  const needsOptions = ['SINGLE', 'MULTIPLE'].includes(value.type);
  return (
    <div className="grid gap-2 rounded-md border p-3 sm:grid-cols-6">
      <div className="sm:col-span-4"><Input value={value.label} onChange={(e) => set({ label: e.target.value })} placeholder="Question" aria-label="Question" /></div>
      <div className="sm:col-span-2"><select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={value.type} onChange={(e) => set({ type: e.target.value })} aria-label="Question type"><option value="SINGLE">Single choice</option><option value="MULTIPLE">Multiple choice</option><option value="RATING">Rating (1–5)</option><option value="YES_NO">Yes / No</option><option value="TEXT">Free text</option></select></div>
      {needsOptions ? <div className="sm:col-span-6"><Input value={(value.options ?? []).join(', ')} onChange={(e) => set({ options: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} placeholder="Options, comma separated" aria-label="Options" /></div> : null}
      <label className="flex items-center gap-2 text-xs sm:col-span-6"><Checkbox checked={value.required !== false} onCheckedChange={(v) => set({ required: Boolean(v) })} /> Required</label>
    </div>
  );
}

export function validateLocally(questions: any[], answers: Answers): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const q of questions) {
    const v = answers[q.key];
    const empty = v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length);
    if (q.required && empty) errors[q.key] = 'Please answer this question';
  }
  return errors;
}

export function useAnswers(initial?: { questionKey: string; value: unknown }[]) {
  const [answers, setAnswers] = React.useState<Answers>(() => Object.fromEntries((initial ?? []).map((a) => [a.questionKey, a.value])));
  React.useEffect(() => { if (initial) setAnswers(Object.fromEntries(initial.map((a) => [a.questionKey, a.value]))); }, [initial]);
  return { answers, set: (key: string, v: unknown) => setAnswers((a) => ({ ...a, [key]: v })) };
}
