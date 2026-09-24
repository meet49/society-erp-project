import * as React from 'react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend, LabelList } from 'recharts';
import { Table as TableIcon, BarChart3 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState } from '@/components/common/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { cn, formatNumber } from '@/lib/utils';

/** Categorical slots in validated order (see styles/globals.css). Never cycled: >6 series fold into "Other". */
export const SERIES_COLORS = ['var(--viz-1)', 'var(--viz-2)', 'var(--viz-3)', 'var(--viz-4)', 'var(--viz-5)', 'var(--viz-6)'];

export interface Series {
  key: string;
  label: string;
  /** explicit slot (0-based) so color follows the entity, not its rank in the current filter */
  slot?: number;
}

interface BaseProps {
  data: Record<string, any>[];
  xKey: string;
  series: Series[];
  height?: number;
  valueFormatter?: (v: number) => string;
  xFormatter?: (v: any) => string;
  stacked?: boolean;
  /** show a value label on the last / max point only (selective direct labels) */
  labelMax?: boolean;
}

const tooltipStyle = { background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 8, color: 'hsl(var(--popover-foreground))', fontSize: 12 };
const axisTick = { fill: 'var(--viz-text-2)', fontSize: 11 };

function useSeriesColor(series: Series[]) {
  return (i: number) => SERIES_COLORS[(series[i]?.slot ?? i) % SERIES_COLORS.length];
}

export function SimpleBarChart({ data, xKey, series, height = 240, valueFormatter = (v) => formatNumber(v), xFormatter, stacked, labelMax }: BaseProps) {
  const color = useSeriesColor(series);
  const maxIdx = React.useMemo(() => (labelMax && series.length === 1 ? data.reduce((best, d, i) => (Number(d[series[0].key]) > Number(data[best]?.[series[0].key] ?? -Infinity) ? i : best), 0) : -1), [data, series, labelMax]);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 16, right: 8, left: 0, bottom: 0 }} barCategoryGap="30%" barGap={2}>
        <CartesianGrid vertical={false} stroke="var(--viz-grid)" strokeDasharray="0" />
        <XAxis dataKey={xKey} tick={axisTick} axisLine={{ stroke: 'var(--viz-grid)' }} tickLine={false} tickFormatter={xFormatter} />
        <YAxis tick={axisTick} axisLine={false} tickLine={false} width={44} tickFormatter={(v) => valueFormatter(Number(v))} />
        <Tooltip cursor={{ fill: 'hsl(var(--muted))', opacity: 0.5 }} contentStyle={tooltipStyle} formatter={(v: any) => valueFormatter(Number(v))} labelFormatter={(l) => (xFormatter ? xFormatter(l) : String(l))} />
        {series.length > 1 ? <Legend wrapperStyle={{ fontSize: 12, color: 'var(--viz-text-2)' }} /> : null}
        {series.map((s, i) => (
          <Bar key={s.key} dataKey={s.key} name={s.label} fill={color(i)} stackId={stacked ? 'a' : undefined} radius={stacked && i < series.length - 1 ? 0 : [4, 4, 0, 0]} stroke="var(--viz-surface)" strokeWidth={stacked ? 2 : 0} maxBarSize={40}>
            {labelMax && series.length === 1 ? <LabelList dataKey={s.key} position="top" formatter={(v: any) => valueFormatter(Number(v))} content={(props: any) => (props.index === maxIdx ? <text x={props.x + props.width / 2} y={props.y - 6} textAnchor="middle" fontSize={11} fill="var(--viz-text)">{valueFormatter(Number(props.value))}</text> : null)} /> : null}
          </Bar>
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function SimpleLineChart({ data, xKey, series, height = 240, valueFormatter = (v) => formatNumber(v), xFormatter }: BaseProps) {
  const color = useSeriesColor(series);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 16, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--viz-grid)" />
        <XAxis dataKey={xKey} tick={axisTick} axisLine={{ stroke: 'var(--viz-grid)' }} tickLine={false} tickFormatter={xFormatter} />
        <YAxis tick={axisTick} axisLine={false} tickLine={false} width={44} tickFormatter={(v) => valueFormatter(Number(v))} />
        <Tooltip cursor={{ stroke: 'var(--viz-text-2)', strokeDasharray: '3 3' }} contentStyle={tooltipStyle} formatter={(v: any) => valueFormatter(Number(v))} labelFormatter={(l) => (xFormatter ? xFormatter(l) : String(l))} />
        {series.length > 1 ? <Legend wrapperStyle={{ fontSize: 12, color: 'var(--viz-text-2)' }} /> : null}
        {series.map((s, i) => (
          <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={color(i)} strokeWidth={2} dot={{ r: 3, strokeWidth: 2, stroke: 'var(--viz-surface)', fill: color(i) }} activeDot={{ r: 5 }} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

/** Horizontal bars for categorical distributions (status, plan, city). One hue: it encodes magnitude, not identity. */
export function HorizontalBars({ data, labelKey, valueKey, valueFormatter = (v) => formatNumber(v), className }: { data: Record<string, any>[]; labelKey: string; valueKey: string; valueFormatter?: (v: number) => string; className?: string }) {
  const max = Math.max(1, ...data.map((d) => Number(d[valueKey]) || 0));
  if (!data.length) return <EmptyState title="No data yet" compact className="border-0" />;
  return (
    <ul className={cn('space-y-2', className)}>
      {data.map((d) => (
        <li key={String(d[labelKey])} className="grid grid-cols-[minmax(80px,1fr)_3fr_auto] items-center gap-3 text-sm">
          <span className="truncate text-muted-foreground">{String(d[labelKey])}</span>
          <div className="h-2 rounded-full bg-muted" role="img" aria-label={`${d[labelKey]}: ${valueFormatter(Number(d[valueKey]))}`}>
            <div className="h-2 rounded-full" style={{ width: `${(Number(d[valueKey]) / max) * 100}%`, background: 'var(--viz-seq-3)' }} />
          </div>
          <span className="tabular text-xs font-medium">{valueFormatter(Number(d[valueKey]))}</span>
        </li>
      ))}
    </ul>
  );
}

/** Card wrapper with a table view toggle (relief for sub-3:1 series colors and screen readers). */
export function ChartCard({ title, description, children, columns, rows, loading, className, actions }: { title: string; description?: string; children: React.ReactNode; columns: { key: string; label: string; format?: (v: any) => React.ReactNode }[]; rows: Record<string, any>[]; loading?: boolean; className?: string; actions?: React.ReactNode }) {
  const [table, setTable] = React.useState(false);
  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
        <div>
          <CardTitle className="text-sm">{title}</CardTitle>
          {description ? <CardDescription>{description}</CardDescription> : null}
        </div>
        <div className="flex items-center gap-1">
          {actions}
          <Button variant="ghost" size="icon-sm" onClick={() => setTable((t) => !t)} aria-label={table ? 'Show chart' : 'Show table'}>
            {table ? <BarChart3 /> : <TableIcon />}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-56" />
        ) : table ? (
          <div className="max-h-72 overflow-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  {columns.map((c) => (
                    <TableHead key={c.key}>{c.label}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r, i) => (
                  <TableRow key={i}>
                    {columns.map((c) => (
                      <TableCell key={c.key} className="tabular">
                        {c.format ? c.format(r[c.key]) : String(r[c.key] ?? '')}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : rows.length ? (
          children
        ) : (
          <EmptyState title="No data yet" compact className="border-0" />
        )}
      </CardContent>
    </Card>
  );
}
