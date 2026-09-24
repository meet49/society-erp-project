import * as React from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, PiggyBank } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { DataTable } from '@/components/common/data-table';
import { PermissionGate, SubscriptionGate } from '@/components/common/gates';
import { useConfirm } from '@/components/common/confirm-dialog';
import { Combobox } from '@/components/common/combobox';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAccounts, useCreateAccount, useDeleteAccount, useFunds, useSaveFund, useUpdateAccount } from '@/hooks/use-accounting';
import { formatCurrency, formatStatus } from '@/lib/utils';
import { getErrorMessage } from '@/lib/errors';

const TYPES = ['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE'];
const blankAccount = { code: '', name: '', type: 'EXPENSE', parentCode: '', description: '', openingBalance: '0', fundKey: '' };

function AccountDialog({ open, onOpenChange, editing, accounts }: { open: boolean; onOpenChange: (o: boolean) => void; editing: any | null; accounts: any[] }) {
  const create = useCreateAccount();
  const update = useUpdateAccount();
  const [form, setForm] = React.useState<any>(blankAccount);
  React.useEffect(() => { if (open) setForm(editing ? { ...blankAccount, ...editing, parentCode: editing.parentCode ?? '', openingBalance: String(editing.openingBalance ?? 0), fundKey: editing.fundKey ?? '', description: editing.description ?? '' } : blankAccount); }, [open, editing]);
  const payload = { code: form.code, name: form.name, type: form.type, parentCode: form.parentCode || null, description: form.description || undefined, openingBalance: Number(form.openingBalance) || 0, fundKey: form.fundKey || null };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{editing ? `Edit ${editing.code}` : 'New ledger account'}</DialogTitle><DialogDescription>Codes group accounts: 1xxx assets, 2xxx liabilities, 3xxx funds & equity, 4xxx income, 5xxx expenses.</DialogDescription></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5"><Label htmlFor="acc-code">Code *</Label><Input id="acc-code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} disabled={Boolean(editing?.isSystem)} /></div>
          <div className="space-y-1.5"><Label>Type *</Label><Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })} disabled={Boolean(editing?.isSystem)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{TYPES.map((t) => <SelectItem key={t} value={t}>{formatStatus(t)}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="acc-name">Name *</Label><Input id="acc-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Parent account</Label><Combobox value={form.parentCode} onChange={(v) => setForm({ ...form, parentCode: v ?? '' })} options={accounts.filter((a) => a.code !== form.code).map((a) => ({ value: a.code, label: `${a.code} · ${a.name}` }))} placeholder="None" /></div>
          <div className="space-y-1.5"><Label htmlFor="acc-fund">Fund key</Label><Input id="acc-fund" value={form.fundKey} onChange={(e) => setForm({ ...form, fundKey: e.target.value.toUpperCase() })} placeholder="SINKING, CORPUS…" /></div>
          {!editing ? <div className="space-y-1.5"><Label htmlFor="acc-opening">Opening balance</Label><Input id="acc-opening" type="number" step="0.01" value={form.openingBalance} onChange={(e) => setForm({ ...form, openingBalance: e.target.value })} /></div> : null}
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="acc-desc">Description</Label><Textarea id="acc-desc" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button loading={create.isPending || update.isPending} disabled={!form.code || !form.name} onClick={() => { const opts = { onSuccess: () => { toast.success(editing ? 'Account updated' : 'Account created'); onOpenChange(false); }, onError: (e: unknown) => toast.error(getErrorMessage(e)) }; if (editing) update.mutate({ id: editing.id, ...payload }, opts); else create.mutate(payload, opts); }}>{editing ? 'Save' : 'Create'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FundsTab({ accounts }: { accounts: any[] }) {
  const funds = useFunds();
  const save = useSaveFund();
  const [editing, setEditing] = React.useState<any | null>(null);
  const [form, setForm] = React.useState<any>(null);
  const openFor = (f: any | null) => { setEditing(f); setForm(f ? { key: f.key, name: f.name, description: f.description ?? '', accountCode: f.accountCode, targetAmount: f.targetAmount ?? '', openingBalance: String(f.openingBalance ?? 0), isActive: f.isActive !== false } : { key: '', name: '', description: '', accountCode: '', targetAmount: '', openingBalance: '0', isActive: true }); };
  return (
    <div className="space-y-4">
      <div className="flex justify-end"><PermissionGate permission="accounting:configure"><Button onClick={() => openFor(null)}><Plus /> New fund</Button></PermissionGate></div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {(funds.data ?? []).map((f: any) => (
          <Card key={f.id}>
            <CardHeader className="flex flex-row items-start justify-between space-y-0"><div><CardTitle className="flex items-center gap-2 text-sm"><PiggyBank className="h-4 w-4" /> {f.name} {!f.isActive ? <Badge variant="muted">Inactive</Badge> : null}</CardTitle><p className="text-xs text-muted-foreground">{f.key} · ledger {f.accountCode}</p></div><PermissionGate permission="accounting:configure"><Button variant="ghost" size="sm" onClick={() => openFor(f)}><Pencil /></Button></PermissionGate></CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold tabular">{formatCurrency(f.balance)}</p>
              <p className="text-xs text-muted-foreground">Contributions {formatCurrency(f.contributions)} · utilised {formatCurrency(f.utilisation)}</p>
              {f.targetAmount ? <div className="mt-2"><Progress value={Math.max(0, f.balance)} max={f.targetAmount} tone={f.balance >= f.targetAmount ? 'success' : 'primary'} /><p className="mt-1 text-xs text-muted-foreground">Target {formatCurrency(f.targetAmount)}</p></div> : null}
            </CardContent>
          </Card>
        ))}
        {!funds.isLoading && !(funds.data ?? []).length ? <p className="text-sm text-muted-foreground">No funds yet.</p> : null}
      </div>
      <Dialog open={Boolean(form)} onOpenChange={(o) => { if (!o) setForm(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? `Edit ${editing.name}` : 'New fund'}</DialogTitle><DialogDescription>Funds are earmarked balances. Charge heads with the same fund key contribute to it; expenses tagged with it draw from it.</DialogDescription></DialogHeader>
          {form ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5"><Label htmlFor="fund-key">Key *</Label><Input id="fund-key" value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value.toUpperCase() })} disabled={Boolean(editing)} /></div>
              <div className="space-y-1.5"><Label htmlFor="fund-name">Name *</Label><Input id="fund-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div className="space-y-1.5 sm:col-span-2"><Label>Ledger account *</Label><Combobox value={form.accountCode} onChange={(v) => setForm({ ...form, accountCode: v ?? '' })} options={accounts.filter((a) => ['EQUITY', 'LIABILITY'].includes(a.type)).map((a) => ({ value: a.code, label: `${a.code} · ${a.name}` }))} placeholder="Fund / equity account" /></div>
              <div className="space-y-1.5"><Label htmlFor="fund-target">Target amount</Label><Input id="fund-target" type="number" min={0} value={form.targetAmount} onChange={(e) => setForm({ ...form, targetAmount: e.target.value })} /></div>
              <div className="space-y-1.5"><Label htmlFor="fund-opening">Opening balance</Label><Input id="fund-opening" type="number" value={form.openingBalance} onChange={(e) => setForm({ ...form, openingBalance: e.target.value })} /></div>
              <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="fund-desc">Description</Label><Textarea id="fund-desc" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
              <label className="flex items-center gap-2 text-sm"><Switch checked={form.isActive} onCheckedChange={(v) => setForm({ ...form, isActive: v })} /> Active</label>
            </div>
          ) : null}
          <DialogFooter><Button variant="outline" onClick={() => setForm(null)}>Cancel</Button><Button loading={save.isPending} disabled={!form?.key || !form?.name || !form?.accountCode} onClick={() => save.mutate({ ...form, targetAmount: form.targetAmount === '' ? null : Number(form.targetAmount), openingBalance: Number(form.openingBalance) || 0 }, { onSuccess: () => { toast.success('Fund saved'); setForm(null); }, onError: (e) => toast.error(getErrorMessage(e)) })}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function ChartOfAccountsPage() {
  const [params] = useSearchParams();
  const accounts = useAccounts({ withBalances: 'true', includeInactive: 'true' });
  const update = useUpdateAccount();
  const remove = useDeleteAccount();
  const { confirm, ConfirmElement } = useConfirm();
  const [dialog, setDialog] = React.useState<{ open: boolean; editing: any | null }>({ open: false, editing: null });
  const [typeFilter, setTypeFilter] = React.useState('');
  const rows = (accounts.data ?? []).filter((a: any) => !typeFilter || a.type === typeFilter);
  return (
    <div>
      {ConfirmElement}
      <PageHeader title="Chart of accounts" description="Ledger accounts and funds. System accounts are used by automatic postings and cannot be deleted." />
      <SubscriptionGate>
        <Tabs defaultValue={params.get('tab') === 'funds' ? 'funds' : 'accounts'}>
          <TabsList><TabsTrigger value="accounts">Accounts</TabsTrigger><TabsTrigger value="funds">Funds</TabsTrigger></TabsList>
          <TabsContent value="accounts" className="mt-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-1.5">{['', ...TYPES].map((t) => <button key={t || 'all'} type="button" onClick={() => setTypeFilter(t)} className={`rounded-full border px-2.5 py-0.5 text-xs ${typeFilter === t ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>{t ? formatStatus(t) : 'All'}</button>)}</div>
              <PermissionGate permission="accounting:configure"><Button onClick={() => setDialog({ open: true, editing: null })}><Plus /> New account</Button></PermissionGate>
            </div>
            <DataTable
              rows={rows}
              loading={accounts.isLoading}
              error={accounts.error}
              onRetry={() => accounts.refetch()}
              rowKey={(a: any) => a.id}
              dense
              columns={[
                { key: 'code', header: 'Code', cell: (a: any) => <span className="font-medium tabular">{a.code}</span> },
                { key: 'name', header: 'Account', cell: (a: any) => <span>{a.name}{a.isSystem ? <Badge variant="outline" className="ml-2">System</Badge> : null}{!a.isActive ? <Badge variant="muted" className="ml-2">Inactive</Badge> : null}{a.fundKey ? <Badge variant="secondary" className="ml-2">{a.fundKey}</Badge> : null}</span> },
                { key: 'type', header: 'Type', hideBelow: 'md', cell: (a: any) => formatStatus(a.type) },
                { key: 'balance', header: 'Balance', className: 'text-right', headerClassName: 'text-right', cell: (a: any) => <span className="tabular">{formatCurrency(a.balance ?? 0)}</span> },
                { key: 'actions', header: '', className: 'text-right', cell: (a: any) => (
                  <PermissionGate permission="accounting:configure">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => setDialog({ open: true, editing: a })}><Pencil /></Button>
                      {!a.isSystem ? (a.isActive ? <Button variant="ghost" size="sm" onClick={async () => { if (await confirm({ title: `Remove ${a.code}?`, description: 'Accounts with postings can only be deactivated.', destructive: true, confirmLabel: 'Remove' })) remove.mutate(a.id, { onSuccess: () => toast.success('Account removed'), onError: () => update.mutate({ id: a.id, isActive: false }, { onSuccess: () => toast.success('Account has postings, so it was deactivated instead'), onError: (e) => toast.error(getErrorMessage(e)) }) }); }}><Trash2 /></Button> : <Button variant="ghost" size="sm" onClick={() => update.mutate({ id: a.id, isActive: true }, { onSuccess: () => toast.success('Account reactivated') })}>Reactivate</Button>) : null}
                    </div>
                  </PermissionGate>
                ) },
              ]}
            />
          </TabsContent>
          <TabsContent value="funds" className="mt-4"><FundsTab accounts={accounts.data ?? []} /></TabsContent>
        </Tabs>
      </SubscriptionGate>
      <AccountDialog open={dialog.open} onOpenChange={(o) => setDialog({ ...dialog, open: o })} editing={dialog.editing} accounts={accounts.data ?? []} />
    </div>
  );
}
