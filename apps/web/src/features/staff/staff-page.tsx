import * as React from 'react';
import dayjs from 'dayjs';
import { toast } from 'sonner';
import { Plus, HardHat, UserCheck, UserX, CalendarClock, Pencil, Trash2, LogIn, LogOut, Download, ChevronLeft, ChevronRight } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { DataTable, useListState } from '@/components/common/data-table';
import { SearchInput, FilterSelect, FilterBar } from '@/components/common/search-input';
import { StatusBadge } from '@/components/common/status-badge';
import { StatCard, StatGrid } from '@/components/common/stat-card';
import { PermissionGate, SubscriptionGate } from '@/components/common/gates';
import { useConfirm } from '@/components/common/confirm-dialog';
import { CardSkeleton } from '@/components/common/loading-state';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAttendanceRegister, useCreateStaff, useDeleteStaff, useExportRegister, useMarkAttendanceRows, useOperationsRealtime, useSaveStaffSettings, useStaffCategories, useStaffList, useStaffPunch, useStaffSettings, useStaffStats, useUpdateStaff } from '@/hooks/use-operations';
import { usePermissions } from '@/hooks/use-access';
import { cn, formatDate, formatStatus, formatTime, toInputDate } from '@/lib/utils';
import { getErrorMessage } from '@/lib/errors';

const STATUS_LETTER: Record<string, string> = { PRESENT: 'P', ABSENT: 'A', HALF_DAY: 'H', LEAVE: 'L', WEEK_OFF: 'W' };
const STATUS_TONE: Record<string, string> = { PRESENT: 'bg-success/15 text-success', ABSENT: 'bg-destructive/15 text-destructive', HALF_DAY: 'bg-warning/20 text-warning-foreground dark:text-warning', LEAVE: 'bg-info/15 text-info', WEEK_OFF: 'bg-muted text-muted-foreground' };
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const blank = { name: '', phone: '', email: '', categoryKey: '', designation: '', employmentType: 'SOCIETY', shiftKey: 'GENERAL', weeklyOff: [0] as number[], joinedAt: '', salaryAmount: '', salaryCycle: 'MONTHLY', idType: '', idNumber: '', address: '', emergencyName: '', emergencyPhone: '', notes: '', status: 'ACTIVE' };

function StaffDialog({ open, onOpenChange, staff }: { open: boolean; onOpenChange: (o: boolean) => void; staff?: any | null }) {
  const categories = useStaffCategories();
  const settings = useStaffSettings();
  const create = useCreateStaff();
  const update = useUpdateStaff();
  const [form, setForm] = React.useState(blank);
  React.useEffect(() => {
    if (!open) return;
    setForm(staff ? { name: staff.name, phone: staff.phone ?? '', email: staff.email ?? '', categoryKey: staff.categoryKey, designation: staff.designation ?? '', employmentType: staff.employmentType ?? 'SOCIETY', shiftKey: staff.shiftKey ?? 'GENERAL', weeklyOff: staff.weeklyOff ?? [0], joinedAt: staff.joinedAt ? toInputDate(staff.joinedAt) : '', salaryAmount: staff.salary?.amount != null ? String(staff.salary.amount) : '', salaryCycle: staff.salary?.cycle ?? 'MONTHLY', idType: staff.idProof?.type ?? '', idNumber: staff.idProof?.number?.includes('*') ? '' : staff.idProof?.number ?? '', address: staff.address ?? '', emergencyName: staff.emergencyContact?.name ?? '', emergencyPhone: staff.emergencyContact?.phone ?? '', notes: staff.notes ?? '', status: staff.status ?? 'ACTIVE' } : blank);
  }, [open, staff]);
  const submit = () => {
    const payload: any = { name: form.name, phone: form.phone || undefined, email: form.email || '', categoryKey: form.categoryKey, designation: form.designation || undefined, employmentType: form.employmentType, shiftKey: form.shiftKey, weeklyOff: form.weeklyOff, joinedAt: form.joinedAt ? new Date(form.joinedAt).toISOString() : null, salary: form.salaryAmount ? { amount: Number(form.salaryAmount), cycle: form.salaryCycle } : undefined, idProof: form.idType ? { type: form.idType, number: form.idNumber } : undefined, address: form.address || undefined, emergencyContact: form.emergencyName ? { name: form.emergencyName, phone: form.emergencyPhone } : undefined, notes: form.notes || undefined, status: form.status };
    if (staff && !form.idNumber) delete payload.idProof;
    const done = { onSuccess: () => { toast.success(staff ? 'Staff updated' : 'Staff added'); onOpenChange(false); }, onError: (e: unknown) => toast.error(getErrorMessage(e)) };
    if (staff) update.mutate({ id: staff.id, ...payload }, done); else create.mutate(payload, done);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl">
        <DialogHeader><DialogTitle>{staff ? `Edit ${staff.name}` : 'Add staff member'}</DialogTitle><DialogDescription>Salary and ID details are visible only to users who can edit staff.</DialogDescription></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1.5"><Label htmlFor="st-name">Name *</Label><Input id="st-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="st-cat">Category *</Label><Select value={form.categoryKey} onValueChange={(v) => setForm({ ...form, categoryKey: v })}><SelectTrigger id="st-cat"><SelectValue placeholder="Choose" /></SelectTrigger><SelectContent>{(categories.data ?? []).map((c: any) => <SelectItem key={c.key} value={c.key}>{c.name}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1.5"><Label htmlFor="st-desig">Designation</Label><Input id="st-desig" value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="st-phone">Phone</Label><Input id="st-phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="st-email">Email</Label><Input id="st-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="st-emp">Employment</Label><Select value={form.employmentType} onValueChange={(v) => setForm({ ...form, employmentType: v })}><SelectTrigger id="st-emp"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="SOCIETY">Society payroll</SelectItem><SelectItem value="AGENCY">Agency</SelectItem><SelectItem value="CONTRACT">Contract</SelectItem></SelectContent></Select></div>
          <div className="space-y-1.5"><Label htmlFor="st-shift">Shift</Label><Select value={form.shiftKey} onValueChange={(v) => setForm({ ...form, shiftKey: v })}><SelectTrigger id="st-shift"><SelectValue /></SelectTrigger><SelectContent>{(settings.data?.shifts ?? [{ key: 'GENERAL', name: 'General', startTime: '09:00', endTime: '18:00' }]).map((s: any) => <SelectItem key={s.key} value={s.key}>{s.name} ({s.startTime}–{s.endTime})</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1.5"><Label htmlFor="st-joined">Joined on</Label><Input id="st-joined" type="date" value={form.joinedAt} onChange={(e) => setForm({ ...form, joinedAt: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="st-status">Status</Label><Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}><SelectTrigger id="st-status"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ACTIVE">Active</SelectItem><SelectItem value="ON_LEAVE">On leave</SelectItem><SelectItem value="INACTIVE">Inactive</SelectItem><SelectItem value="RESIGNED">Resigned</SelectItem></SelectContent></Select></div>
          <div className="space-y-1.5 sm:col-span-2 lg:col-span-3"><Label>Weekly off</Label><div className="flex flex-wrap gap-1.5">{DAYS.map((d, i) => <button key={d} type="button" onClick={() => setForm({ ...form, weeklyOff: form.weeklyOff.includes(i) ? form.weeklyOff.filter((x) => x !== i) : [...form.weeklyOff, i] })} className={cn('rounded-full border px-3 py-1 text-xs', form.weeklyOff.includes(i) ? 'border-primary bg-primary text-primary-foreground' : 'bg-card')}>{d}</button>)}</div></div>
          <div className="space-y-1.5"><Label htmlFor="st-salary">Salary (₹)</Label><div className="flex gap-2"><Input id="st-salary" type="number" min={0} value={form.salaryAmount} onChange={(e) => setForm({ ...form, salaryAmount: e.target.value })} /><Select value={form.salaryCycle} onValueChange={(v) => setForm({ ...form, salaryCycle: v })}><SelectTrigger className="w-32"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="MONTHLY">per month</SelectItem><SelectItem value="DAILY">per day</SelectItem></SelectContent></Select></div></div>
          <div className="space-y-1.5"><Label htmlFor="st-idtype">ID proof</Label><Input id="st-idtype" value={form.idType} onChange={(e) => setForm({ ...form, idType: e.target.value })} placeholder="Aadhaar, PAN…" /></div>
          <div className="space-y-1.5"><Label htmlFor="st-idno">ID number</Label><Input id="st-idno" value={form.idNumber} onChange={(e) => setForm({ ...form, idNumber: e.target.value })} placeholder={staff?.idProof?.number ?? ''} /></div>
          <div className="space-y-1.5"><Label htmlFor="st-ename">Emergency contact</Label><Input id="st-ename" value={form.emergencyName} onChange={(e) => setForm({ ...form, emergencyName: e.target.value })} placeholder="Name" /></div>
          <div className="space-y-1.5"><Label htmlFor="st-ephone">Emergency phone</Label><Input id="st-ephone" value={form.emergencyPhone} onChange={(e) => setForm({ ...form, emergencyPhone: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="st-addr">Address</Label><Input id="st-addr" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
          <div className="space-y-1.5 sm:col-span-2 lg:col-span-3"><Label htmlFor="st-notes">Notes</Label><Textarea id="st-notes" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button loading={create.isPending || update.isPending} disabled={form.name.trim().length < 2 || !form.categoryKey} onClick={submit}>{staff ? 'Save' : 'Add'}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RegisterTab() {
  const [month, setMonth] = React.useState(dayjs().format('YYYY-MM'));
  const [category, setCategory] = React.useState('');
  const categories = useStaffCategories();
  const register = useAttendanceRegister(month, category);
  const mark = useMarkAttendanceRows();
  const exportRows = useExportRegister();
  const { can } = usePermissions();
  const today = dayjs().format('YYYY-MM-DD');
  const cycle = (staffId: string, date: string, current?: string) => {
    if (!can('staff:attendance') || dayjs(date).isAfter(dayjs(), 'day')) return;
    const order = ['PRESENT', 'HALF_DAY', 'ABSENT', 'LEAVE', 'WEEK_OFF'];
    const next = order[(order.indexOf(current ?? '') + 1) % order.length];
    mark.mutate({ date, entries: [{ staffId, status: next }] }, { onError: (e) => toast.error(getErrorMessage(e)) });
  };
  const markAll = (status: string) => { const rows = register.data?.rows ?? []; if (!rows.length) return; mark.mutate({ date: today, entries: rows.map((r: any) => ({ staffId: r.staff.id, status })) }, { onSuccess: () => toast.success(`Everyone marked ${formatStatus(status).toLowerCase()} for today`), onError: (e) => toast.error(getErrorMessage(e)) }); };
  const d = register.data;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => setMonth(dayjs(month).subtract(1, 'month').format('YYYY-MM'))}><ChevronLeft /></Button>
        <span className="min-w-32 text-center text-sm font-medium">{dayjs(month).format('MMMM YYYY')}</span>
        <Button size="sm" variant="outline" onClick={() => setMonth(dayjs(month).add(1, 'month').format('YYYY-MM'))} disabled={dayjs(month).isSame(dayjs(), 'month')}><ChevronRight /></Button>
        <FilterSelect value={category} onChange={setCategory} options={(categories.data ?? []).map((c: any) => ({ value: c.key, label: c.name }))} allLabel="All categories" />
        <span className="flex-1" />
        {can('staff:attendance') && month === today.slice(0, 7) ? <><Button size="sm" variant="outline" onClick={() => markAll('PRESENT')}><UserCheck /> All present today</Button></> : null}
        <PermissionGate permission={['staff:export', 'staff:attendance']}><Button size="sm" variant="outline" loading={exportRows.isPending} onClick={() => exportRows.mutate(month, { onError: (e) => toast.error(getErrorMessage(e)) })}><Download /> Export</Button></PermissionGate>
      </div>
      <p className="text-xs text-muted-foreground">Click a day to cycle Present → Half day → Absent → Leave → Week off. Gate punches and the nightly job fill the rest.</p>
      {register.isLoading ? <CardSkeleton count={2} /> : !d?.rows?.length ? <p className="text-sm text-muted-foreground">No staff to show.</p> : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full text-xs">
            <thead><tr className="border-b bg-muted/40"><th className="sticky left-0 z-10 bg-muted/40 px-2 py-2 text-left">Staff</th>{d.days.map((day: string) => <th key={day} className={cn('px-1 py-2 text-center font-normal', dayjs(day).day() === 0 && 'text-muted-foreground', day === today && 'text-primary font-semibold')}>{day.slice(-2)}</th>)}<th className="px-2 py-2 text-right">P</th><th className="px-2 py-2 text-right">A</th><th className="px-2 py-2 text-right">L</th><th className="px-2 py-2 text-right">Late</th><th className="px-2 py-2 text-right">OT h</th></tr></thead>
            <tbody>
              {d.rows.map((r: any) => (
                <tr key={r.staff.id} className="border-b last:border-0">
                  <td className="sticky left-0 z-10 bg-card px-2 py-1.5 whitespace-nowrap"><span className="font-medium">{r.staff.name}</span><span className="block text-[10px] text-muted-foreground">{formatStatus(r.staff.categoryKey)}</span></td>
                  {d.days.map((day: string) => { const cell = r.byDate[day]; return <td key={day} className="px-0.5 py-1 text-center"><button type="button" onClick={() => cycle(r.staff.id, day, cell?.status)} title={cell ? `${formatStatus(cell.status)}${cell.late ? ' · late' : ''}${cell.checkInAt ? ` · in ${formatTime(cell.checkInAt)}` : ''}${cell.checkOutAt ? ` out ${formatTime(cell.checkOutAt)}` : ''}` : 'Not marked'} className={cn('h-6 w-6 rounded text-[10px] font-semibold', cell ? STATUS_TONE[cell.status] : 'bg-transparent text-muted-foreground/40 hover:bg-muted', cell?.late && 'ring-1 ring-warning')}>{cell ? STATUS_LETTER[cell.status] : '·'}</button></td>; })}
                  <td className="px-2 py-1 text-right">{r.summary.present + r.summary.halfDay * 0.5}</td><td className="px-2 py-1 text-right">{r.summary.absent}</td><td className="px-2 py-1 text-right">{r.summary.leave}</td><td className="px-2 py-1 text-right">{r.summary.late}</td><td className="px-2 py-1 text-right">{Math.round((r.summary.overtimeMinutes / 60) * 10) / 10}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SettingsTab() {
  const settings = useStaffSettings();
  const save = useSaveStaffSettings();
  const [form, setForm] = React.useState<any>(null);
  React.useEffect(() => { if (settings.data && !form) setForm(settings.data); }, [settings.data, form]);
  if (!form) return <CardSkeleton count={1} />;
  return (
    <div className="max-w-2xl space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5"><Label htmlFor="sc-grace">Late after (minutes past shift start)</Label><Input id="sc-grace" type="number" min={0} value={form.shiftGraceMinutes} onChange={(e) => setForm({ ...form, shiftGraceMinutes: Number(e.target.value) })} /></div>
        <div className="space-y-1.5"><Label htmlFor="sc-ot">Overtime after (minutes worked)</Label><Input id="sc-ot" type="number" min={60} value={form.overtimeAfterMinutes} onChange={(e) => setForm({ ...form, overtimeAfterMinutes: Number(e.target.value) })} /></div>
        <div className="space-y-1.5"><Label htmlFor="sc-rem">Remind about unmarked attendance at (hour)</Label><Input id="sc-rem" type="number" min={0} max={23} value={form.attendanceReminderHour ?? 12} onChange={(e) => setForm({ ...form, attendanceReminderHour: Number(e.target.value) })} /></div>
      </div>
      <div className="space-y-2">
        <Label>Shifts</Label>
        {(form.shifts ?? []).map((s: any, i: number) => <div key={i} className="grid gap-2 sm:grid-cols-5"><Input value={s.key} placeholder="KEY" aria-label="Shift key" onChange={(e) => setForm({ ...form, shifts: form.shifts.map((x: any, j: number) => (j === i ? { ...x, key: e.target.value.toUpperCase() } : x)) })} /><Input className="sm:col-span-2" value={s.name} placeholder="Name" aria-label="Shift name" onChange={(e) => setForm({ ...form, shifts: form.shifts.map((x: any, j: number) => (j === i ? { ...x, name: e.target.value } : x)) })} /><Input type="time" value={s.startTime} aria-label="Start" onChange={(e) => setForm({ ...form, shifts: form.shifts.map((x: any, j: number) => (j === i ? { ...x, startTime: e.target.value } : x)) })} /><div className="flex gap-1"><Input type="time" value={s.endTime} aria-label="End" onChange={(e) => setForm({ ...form, shifts: form.shifts.map((x: any, j: number) => (j === i ? { ...x, endTime: e.target.value } : x)) })} />{form.shifts.length > 1 ? <Button size="sm" variant="ghost" onClick={() => setForm({ ...form, shifts: form.shifts.filter((_: any, j: number) => j !== i) })}><Trash2 /></Button> : null}</div></div>)}
        <Button size="sm" variant="outline" onClick={() => setForm({ ...form, shifts: [...(form.shifts ?? []), { key: '', name: '', startTime: '09:00', endTime: '18:00' }] })}><Plus /> Shift</Button>
      </div>
      <Button loading={save.isPending} onClick={() => save.mutate({ shiftGraceMinutes: form.shiftGraceMinutes, overtimeAfterMinutes: form.overtimeAfterMinutes, attendanceReminderHour: form.attendanceReminderHour, defaultShiftKey: form.defaultShiftKey, shifts: (form.shifts ?? []).filter((s: any) => s.key && s.name) }, { onSuccess: () => toast.success('Staff settings saved'), onError: (e) => toast.error(getErrorMessage(e)) })}>Save settings</Button>
    </div>
  );
}

/** Staff directory, attendance register and shift settings. */
export default function StaffPage() {
  const { can } = usePermissions();
  const stats = useStaffStats();
  const categories = useStaffCategories();
  const list = useListState({ limit: 25, sort: 'name' });
  const staff = useStaffList(list.params);
  const punch = useStaffPunch();
  const remove = useDeleteStaff();
  const { confirm, ConfirmElement } = useConfirm();
  const [editing, setEditing] = React.useState<any | 'new' | null>(null);
  useOperationsRealtime();
  const err = (e: unknown) => toast.error(getErrorMessage(e));
  return (
    <div>
      <PageHeader title="Staff" description="Housekeeping, security and maintenance teams with shifts and attendance." actions={<PermissionGate permission="staff:create"><SubscriptionGate><Button onClick={() => setEditing('new')}><Plus /> Add staff</Button></SubscriptionGate></PermissionGate>} />
      <StatGrid className="mb-6">
        <StatCard label="Headcount" value={stats.data?.headcount ?? 0} hint={(stats.data?.byCategory ?? []).slice(0, 3).map((c: any) => `${c.count} ${formatStatus(c.category).toLowerCase()}`).join(' · ')} icon={<HardHat />} loading={stats.isLoading} />
        <StatCard label="Present today" value={stats.data?.today?.present ?? 0} hint={`${stats.data?.today?.leave ?? 0} on leave · ${stats.data?.today?.weekOff ?? 0} week off`} icon={<UserCheck />} tone="success" loading={stats.isLoading} />
        <StatCard label="Absent today" value={stats.data?.today?.absent ?? 0} icon={<UserX />} tone={(stats.data?.today?.absent ?? 0) > 0 ? 'warning' : 'default'} loading={stats.isLoading} />
        <StatCard label="Not yet marked" value={stats.data?.today?.unmarked ?? 0} icon={<CalendarClock />} tone={(stats.data?.today?.unmarked ?? 0) > 0 ? 'warning' : 'default'} loading={stats.isLoading} />
      </StatGrid>
      <Tabs defaultValue="staff">
        <TabsList className="mb-4"><TabsTrigger value="staff">Staff</TabsTrigger><TabsTrigger value="attendance">Attendance register</TabsTrigger>{can('staff:configure') ? <TabsTrigger value="settings">Shifts & rules</TabsTrigger> : null}</TabsList>
        <TabsContent value="staff">
          <FilterBar onReset={list.reset}>
            <SearchInput value={list.search} onChange={list.setSearch} placeholder="Name, phone, number…" className="w-full sm:w-64" />
            <FilterSelect value={list.filters.categoryKey ?? ''} onChange={(v) => list.setFilter('categoryKey', v)} options={(categories.data ?? []).map((c: any) => ({ value: c.key, label: c.name }))} allLabel="All categories" />
            <FilterSelect value={list.filters.status ?? ''} onChange={(v) => list.setFilter('status', v)} options={['ACTIVE', 'ON_LEAVE', 'INACTIVE', 'RESIGNED'].map((s) => ({ value: s, label: formatStatus(s) }))} allLabel="Active & on leave" />
          </FilterBar>
          <DataTable
            rows={staff.data?.items}
            loading={staff.isFetching}
            error={staff.error}
            onRetry={() => staff.refetch()}
            rowKey={(s: any) => s.id}
            sort={list.sort}
            onSortChange={list.setSort}
            emptyTitle="No staff yet"
            emptyDescription="Add the people who keep the society running; attendance and payroll summaries follow."
            columns={[
              { key: 'name', header: 'Name', sortable: true, cell: (s: any) => <span><span className="font-medium">{s.name}</span><span className="block text-xs text-muted-foreground">{s.staffNumber} · {s.designation ?? formatStatus(s.categoryKey)}{s.vendorId?.name ? ` · ${s.vendorId.name}` : s.employmentType !== 'SOCIETY' ? ` · ${formatStatus(s.employmentType)}` : ''}</span></span> },
              { key: 'categoryKey', header: 'Category', sortable: true, hideBelow: 'md', cell: (s: any) => <Badge variant="outline">{formatStatus(s.categoryKey)}</Badge> },
              { key: 'shift', header: 'Shift', hideBelow: 'lg', cell: (s: any) => `${formatStatus(s.shiftKey)} · off ${(s.weeklyOff ?? []).map((d: number) => DAYS[d]).join(', ') || '—'}` },
              { key: 'today', header: 'Today', cell: (s: any) => s.today ? <span className="flex items-center gap-1"><StatusBadge status={s.today.status} />{s.today.checkInAt ? <span className="text-xs text-muted-foreground">{formatTime(s.today.checkInAt)}{s.today.checkOutAt ? ` – ${formatTime(s.today.checkOutAt)}` : ''}</span> : null}</span> : <span className="text-xs text-muted-foreground">Not marked</span> },
              { key: 'status', header: 'Status', sortable: true, hideBelow: 'sm', cell: (s: any) => <StatusBadge status={s.status} /> },
              { key: 'actions', header: '', cell: (s: any) => <span className="flex justify-end gap-1">
                {can('staff:attendance') && s.status === 'ACTIVE' ? (!s.today?.checkInAt ? <Button size="sm" variant="ghost" onClick={() => punch.mutate({ id: s.id, direction: 'in' }, { onSuccess: () => toast.success(`${s.name} checked in`), onError: err })}><LogIn /> In</Button> : !s.today?.checkOutAt ? <Button size="sm" variant="ghost" onClick={() => punch.mutate({ id: s.id, direction: 'out' }, { onSuccess: () => toast.success(`${s.name} checked out`), onError: err })}><LogOut /> Out</Button> : null) : null}
                {can('staff:update') ? <Button size="sm" variant="ghost" onClick={() => setEditing(s)}><Pencil /></Button> : null}
                {can('staff:delete') ? <Button size="sm" variant="ghost" className="text-destructive" onClick={async () => { if (await confirm({ title: `Remove ${s.name}?`, description: 'Attendance history is kept.', destructive: true, confirmLabel: 'Remove' })) remove.mutate(s.id, { onError: err }); }}><Trash2 /></Button> : null}
              </span> },
            ]}
            pagination={staff.data ? { page: staff.data.page, pages: staff.data.pages, total: staff.data.total, limit: staff.data.limit, onPageChange: list.setPage, onLimitChange: list.setLimit } : undefined}
          />
        </TabsContent>
        <TabsContent value="attendance"><RegisterTab /></TabsContent>
        {can('staff:configure') ? <TabsContent value="settings"><SettingsTab /></TabsContent> : null}
      </Tabs>
      <StaffDialog open={editing !== null} onOpenChange={(o) => { if (!o) setEditing(null); }} staff={editing === 'new' ? null : editing} />
      {ConfirmElement}
      <p className="mt-4 text-xs text-muted-foreground">{formatDate(new Date())}</p>
    </div>
  );
}
