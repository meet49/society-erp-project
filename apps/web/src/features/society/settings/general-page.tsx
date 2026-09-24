import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { SocietyTypes, emailSchema, phoneSchema, slugSchema } from '@society-erp/shared';
import { PageHeader } from '@/components/common/page-header';
import { SettingsNav } from '@/features/society/settings/settings-nav';
import { FormSection, TextField, SelectField, TextareaField, applyServerErrors } from '@/components/common/form';
import { Button } from '@/components/ui/button';
import { PageSkeleton } from '@/components/common/loading-state';
import { ErrorState } from '@/components/common/error-state';
import { PermissionGate } from '@/components/common/gates';
import { useSocietyProfile, useUpdateSocietyProfile, useSocietySetting, useSaveSocietySetting } from '@/hooks/use-society';
import { formatStatus } from '@/lib/utils';

const schema = z.object({
  name: z.string().trim().min(3).max(160),
  slug: slugSchema,
  type: z.enum(SocietyTypes),
  registrationNumber: z.string().trim().max(80).optional().or(z.literal('')),
  address: z.object({ line1: z.string().max(200).optional(), line2: z.string().max(200).optional(), city: z.string().max(80).optional(), state: z.string().max(80).optional(), pincode: z.string().max(12).optional(), country: z.string().max(80).optional() }),
  contact: z.object({ email: emailSchema.optional().or(z.literal('')), phone: phoneSchema.optional().or(z.literal('')), website: z.string().max(200).optional().or(z.literal('')) }),
  timezone: z.string().max(60),
  currency: z.string().length(3),
  logoUrl: z.string().url().optional().or(z.literal('')),
  notes: z.string().max(2000).optional(),
});
type Input = z.infer<typeof schema>;

const generalSchema = z.object({ financialYearStartMonth: z.coerce.number().int().min(1).max(12), dateFormat: z.string().max(20), unitCodeFormat: z.string().max(40) });

export default function GeneralSettingsPage() {
  const profile = useSocietyProfile();
  const update = useUpdateSocietyProfile();
  const general = useSocietySetting('society.general');
  const saveSetting = useSaveSocietySetting();
  const form = useForm<Input>({ resolver: zodResolver(schema), values: profile.data ? { name: profile.data.name, slug: profile.data.slug, type: profile.data.type, registrationNumber: profile.data.registrationNumber ?? '', address: { ...profile.data.address }, contact: { email: profile.data.contact?.email ?? '', phone: profile.data.contact?.phone ?? '', website: profile.data.contact?.website ?? '' }, timezone: profile.data.timezone, currency: profile.data.currency, logoUrl: profile.data.logoUrl ?? '', notes: profile.data.notes ?? '' } : undefined });
  const generalForm = useForm<z.infer<typeof generalSchema>>({ resolver: zodResolver(generalSchema), values: general.data ? { financialYearStartMonth: general.data.financialYearStartMonth, dateFormat: general.data.dateFormat, unitCodeFormat: general.data.unitCodeFormat } : undefined });
  if (profile.isLoading) return <PageSkeleton />;
  if (profile.isError) return <ErrorState error={profile.error} onRetry={() => profile.refetch()} />;
  return (
    <div>
      <PageHeader title="Society settings" description="Profile, address and general preferences." />
      <SettingsNav />
      <PermissionGate permission={['society:update', 'society:manage_settings']} fallback={<p className="text-sm text-muted-foreground">You can view these settings but not change them.</p>}>
        <form className="space-y-6" onSubmit={form.handleSubmit((v) => update.mutate(v, { onSuccess: () => toast.success('Society updated'), onError: (e) => applyServerErrors(form, e) }))} noValidate>
          <FormSection title="Profile" description="Shown to residents and on receipts.">
            <TextField control={form.control} name="name" label="Society name" required />
            <TextField control={form.control} name="slug" label="URL slug" required hint="Lowercase letters, numbers and hyphens" />
            <SelectField control={form.control} name="type" label="Type" options={SocietyTypes.map((t) => ({ value: t, label: formatStatus(t) }))} />
            <TextField control={form.control} name="registrationNumber" label="Registration number" />
            <TextField control={form.control} name="logoUrl" label="Logo URL" placeholder="https://…" />
            <TextField control={form.control} name="currency" label="Currency" maxLength={3} />
            <TextField control={form.control} name="timezone" label="Timezone" />
          </FormSection>
          <FormSection title="Address & contact">
            <TextField control={form.control} name="address.line1" label="Address line 1" className="sm:col-span-2" />
            <TextField control={form.control} name="address.line2" label="Address line 2" className="sm:col-span-2" />
            <TextField control={form.control} name="address.city" label="City" />
            <TextField control={form.control} name="address.state" label="State" />
            <TextField control={form.control} name="address.pincode" label="PIN code" />
            <TextField control={form.control} name="address.country" label="Country" />
            <TextField control={form.control} name="contact.email" label="Office email" type="email" />
            <TextField control={form.control} name="contact.phone" label="Office phone" type="tel" />
            <TextField control={form.control} name="contact.website" label="Website" className="sm:col-span-2" />
            <TextareaField control={form.control} name="notes" label="Internal notes" className="sm:col-span-2" rows={2} />
          </FormSection>
          <Button type="submit" loading={update.isPending}>Save profile</Button>
        </form>
        <form className="mt-8 space-y-4" onSubmit={generalForm.handleSubmit((v) => saveSetting.mutate({ key: 'society.general', value: v }, { onSuccess: () => toast.success('Preferences saved') }))} noValidate>
          <FormSection title="General preferences" description="Financial year, date format and unit code pattern.">
            <SelectField control={generalForm.control} name="financialYearStartMonth" label="Financial year starts in" options={['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].map((m, i) => ({ value: String(i + 1), label: m }))} />
            <TextField control={generalForm.control} name="dateFormat" label="Date format" hint="e.g. DD MMM YYYY" />
            <TextField control={generalForm.control} name="unitCodeFormat" label="Unit code pattern" hint="Tokens: {building} {number}" />
          </FormSection>
          <Button type="submit" variant="outline" loading={saveSetting.isPending}>Save preferences</Button>
        </form>
      </PermissionGate>
    </div>
  );
}
