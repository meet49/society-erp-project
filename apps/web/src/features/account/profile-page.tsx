import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { toast } from 'sonner';
import { passwordSchema, phoneSchema } from '@society-erp/shared';
import { PageHeader } from '@/components/common/page-header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { TextField, SwitchField, applyServerErrors } from '@/components/common/form';
import { DataTable } from '@/components/common/data-table';
import { useAuth, useChangePassword, useRevokeAllSessions, useRevokeSession, useSessions, useUpdateProfile } from '@/hooks/use-auth';
import { formatDateTime, formatRelative } from '@/lib/utils';
import { getErrorMessage } from '@/lib/errors';

const profileSchema = z.object({ name: z.string().trim().min(2).max(80), phone: phoneSchema.optional().or(z.literal('')), preferences: z.object({ channels: z.object({ email: z.boolean(), whatsapp: z.boolean(), push: z.boolean() }) }) });
const passwordFormSchema = z.object({ currentPassword: z.string().min(1, 'Required'), newPassword: passwordSchema, confirm: z.string() }).refine((v) => v.newPassword === v.confirm, { message: 'Passwords do not match', path: ['confirm'] });

export default function ProfilePage() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const update = useUpdateProfile();
  const change = useChangePassword();
  const sessions = useSessions();
  const revoke = useRevokeSession();
  const revokeAll = useRevokeAllSessions();

  const profileForm = useForm<z.infer<typeof profileSchema>>({ resolver: zodResolver(profileSchema), values: { name: user?.name ?? '', phone: user?.phone ?? '', preferences: { channels: { email: true, whatsapp: true, push: true } } } });
  const pwForm = useForm<z.infer<typeof passwordFormSchema>>({ resolver: zodResolver(passwordFormSchema), defaultValues: { currentPassword: '', newPassword: '', confirm: '' } });

  return (
    <div>
      <PageHeader title="Account settings" description={user?.email} />
      <Tabs value={params.get('tab') ?? 'profile'} onValueChange={(v) => setParams({ tab: v })}>
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="security">Password & sessions</TabsTrigger>
        </TabsList>
        <TabsContent value="profile">
          <Card className="max-w-2xl">
            <CardHeader>
              <CardTitle>Your profile</CardTitle>
              <CardDescription>Name, phone and how you want to be notified.</CardDescription>
            </CardHeader>
            <CardContent>
              <form className="grid gap-4 sm:grid-cols-2" onSubmit={profileForm.handleSubmit((v) => update.mutate({ name: v.name, phone: v.phone, preferences: v.preferences }, { onSuccess: () => toast.success('Profile updated'), onError: (e) => applyServerErrors(profileForm, e) }))} noValidate>
                <TextField control={profileForm.control} name="name" label="Full name" required />
                <TextField control={profileForm.control} name="phone" label="Phone" type="tel" />
                <div className="space-y-2 sm:col-span-2">
                  <p className="text-sm font-medium">Notification channels</p>
                  <SwitchField control={profileForm.control} name="preferences.channels.email" label="Email" description="Invoices, receipts, complaint updates and reminders" />
                  <SwitchField control={profileForm.control} name="preferences.channels.whatsapp" label="WhatsApp" description="Visitor approvals and urgent alerts (when enabled by your society)" />
                  <SwitchField control={profileForm.control} name="preferences.channels.push" label="Push notifications" description="Realtime alerts on this device" />
                </div>
                <div className="sm:col-span-2">
                  <Button type="submit" loading={update.isPending}>
                    Save changes
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="security" className="space-y-6">
          <Card className="max-w-2xl">
            <CardHeader>
              <CardTitle>Change password</CardTitle>
              <CardDescription>Other sessions will be signed out after the change.</CardDescription>
            </CardHeader>
            <CardContent>
              <form className="grid gap-4 sm:grid-cols-2" onSubmit={pwForm.handleSubmit((v) => change.mutate({ currentPassword: v.currentPassword, newPassword: v.newPassword }, { onSuccess: () => { toast.success('Password changed'); pwForm.reset(); }, onError: (e) => { if (!applyServerErrors(pwForm, e)) pwForm.setError('currentPassword', { message: getErrorMessage(e) }); } }))} noValidate>
                <TextField control={pwForm.control} name="currentPassword" label="Current password" type="password" autoComplete="current-password" className="sm:col-span-2" />
                <TextField control={pwForm.control} name="newPassword" label="New password" type="password" autoComplete="new-password" />
                <TextField control={pwForm.control} name="confirm" label="Confirm new password" type="password" autoComplete="new-password" />
                <div className="sm:col-span-2">
                  <Button type="submit" loading={change.isPending}>
                    Update password
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle>Active sessions</CardTitle>
                <CardDescription>Devices currently signed in to your account.</CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={() => revokeAll.mutate(undefined, { onSuccess: (d) => toast.success(`${d.revoked} other session(s) signed out`) })} loading={revokeAll.isPending}>
                Sign out other devices
              </Button>
            </CardHeader>
            <CardContent>
              <DataTable
                rows={sessions.data}
                loading={sessions.isLoading}
                error={sessions.error}
                rowKey={(s: any) => s.familyId}
                columns={[
                  { key: 'device', header: 'Device', cell: (s: any) => <span className="line-clamp-1 max-w-xs text-xs">{s.userAgent ?? 'Unknown device'}</span> },
                  { key: 'ip', header: 'IP', cell: (s: any) => s.ip ?? '—', hideBelow: 'md' },
                  { key: 'created', header: 'Signed in', cell: (s: any) => formatDateTime(s.createdAt), hideBelow: 'md' },
                  { key: 'last', header: 'Last active', cell: (s: any) => formatRelative(s.lastUsedAt) },
                  { key: 'ctx', header: 'Context', cell: (s: any) => (s.isPlatform ? <Badge variant="info">Platform</Badge> : <Badge variant="secondary">Society</Badge>) },
                  { key: 'actions', header: '', cell: (s: any) => (s.current ? <Badge variant="success">This device</Badge> : <Button variant="ghost" size="sm" onClick={() => revoke.mutate(s.familyId)}>Sign out</Button>) },
                ]}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
