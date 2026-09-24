import * as React from 'react';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/common/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { DataTable } from '@/components/common/data-table';
import { PageSkeleton } from '@/components/common/loading-state';
import { usePlans, usePlatformSettings, useUpdatePlan, useUpdatePlatformSettings } from '@/hooks/use-platform';
import { formatCurrency } from '@/lib/utils';

export default function PricingSettingsPage() {
  const settings = usePlatformSettings('website');
  const update = useUpdatePlatformSettings();
  const plans = usePlans();
  const updatePlan = useUpdatePlan();
  const stored = settings.data?.find((s: any) => s.key === 'landing.pricing')?.value ?? {};
  const [pricing, setPricing] = React.useState<any>(null);
  const value = pricing ?? stored;
  if (settings.isLoading || plans.isLoading) return <PageSkeleton />;

  return (
    <div>
      <PageHeader title="Pricing display" description="How plans are presented on the public site. Prices and limits themselves live in Plans." actions={<Button asChild variant="outline"><Link to="/admin/plans">Manage plans</Link></Button>} />
      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Display options</CardTitle>
            <CardDescription>Stored as the landing.pricing platform setting.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between text-sm"><Label>Show annual discount label</Label><Switch checked={value.showAnnualDiscount !== false} onCheckedChange={(v) => setPricing({ ...value, showAnnualDiscount: v })} /></div>
            <div className="space-y-1.5"><Label>Annual discount label</Label><Input value={value.annualDiscountLabel ?? ''} onChange={(e) => setPricing({ ...value, annualDiscountLabel: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Currency symbol</Label><Input value={value.currencySymbol ?? ''} onChange={(e) => setPricing({ ...value, currencySymbol: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Footnote</Label><Input value={value.note ?? ''} onChange={(e) => setPricing({ ...value, note: e.target.value })} /></div>
            <Button loading={update.isPending} onClick={() => update.mutate([{ key: 'landing.pricing', value }], { onSuccess: () => { toast.success('Pricing display updated'); setPricing(null); } })}>Save</Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Plans on the public site</CardTitle>
            <CardDescription>Toggle visibility and highlight without leaving this page.</CardDescription>
          </CardHeader>
          <CardContent>
            <DataTable
              rows={(plans.data ?? []).filter((p: any) => p.status === 'ACTIVE')}
              rowKey={(p: any) => p.id}
              columns={[
                { key: 'name', header: 'Plan', cell: (p: any) => <span className="font-medium">{p.name} {p.badge ? <Badge variant="secondary" className="ml-1">{p.badge}</Badge> : null}</span> },
                { key: 'price', header: 'Price', cell: (p: any) => `${formatCurrency(p.monthlyPrice, p.currency)} / ${formatCurrency(p.annualPrice, p.currency)}` },
                { key: 'order', header: 'Order', cell: (p: any) => <Input type="number" className="h-8 w-20" defaultValue={p.displayOrder} onBlur={(e) => Number(e.target.value) !== p.displayOrder && updatePlan.mutate({ id: p.id, displayOrder: Number(e.target.value) })} /> },
                { key: 'visible', header: 'Visible', cell: (p: any) => <Switch checked={p.publicVisibility} onCheckedChange={(v) => updatePlan.mutate({ id: p.id, publicVisibility: v })} /> },
                { key: 'highlight', header: 'Highlighted', cell: (p: any) => <Switch checked={p.highlighted} onCheckedChange={(v) => updatePlan.mutate({ id: p.id, highlighted: v })} /> },
              ]}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
