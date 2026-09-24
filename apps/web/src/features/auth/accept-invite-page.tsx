import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { passwordSchema } from '@society-erp/shared';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { TextField } from '@/components/common/form';
import { useAcceptInvitation, useInvitation } from '@/hooks/use-auth';
import { landingPath } from '@/hooks/use-access';
import { getErrorMessage } from '@/lib/errors';
import { formatDate } from '@/lib/utils';

const schema = z.object({ name: z.string().trim().min(2).max(80).optional(), password: passwordSchema });
type Input = z.infer<typeof schema>;

export default function AcceptInvitePage() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const invitation = useInvitation(token);
  const accept = useAcceptInvitation();
  const navigate = useNavigate();
  const form = useForm<Input>({ resolver: zodResolver(schema), defaultValues: { name: '', password: '' } });

  if (!token) {
    return (
      <Alert variant="destructive">
        <AlertDescription>This invitation link is incomplete. Ask your society administrator to resend it.</AlertDescription>
      </Alert>
    );
  }
  if (invitation.isLoading) return <Skeleton className="h-64" />;
  if (invitation.isError || !invitation.data) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          {getErrorMessage(invitation.error)}{' '}
          <Link to="/login" className="underline">
            Sign in
          </Link>
        </AlertDescription>
      </Alert>
    );
  }
  const inv = invitation.data;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Join {inv.society?.name}</h1>
        <p className="text-sm text-muted-foreground">
          You were invited as {inv.roles?.map((r: any) => r.name).join(', ')} · valid until {formatDate(inv.expiresAt)}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Badge variant="secondary">{inv.email}</Badge>
          {inv.existingUser ? <Badge variant="info">Existing account</Badge> : null}
        </div>
        {inv.message ? <p className="mt-3 rounded-md bg-muted p-3 text-sm">“{inv.message}”</p> : null}
      </div>
      {accept.isError ? (
        <Alert variant="destructive">
          <AlertDescription>{getErrorMessage(accept.error)}</AlertDescription>
        </Alert>
      ) : null}
      <form
        className="space-y-4"
        onSubmit={form.handleSubmit((v) =>
          accept.mutate(
            { token, name: v.name || undefined, password: v.password },
            { onSuccess: (data) => navigate(landingPath(data.context.landing, true, false), { replace: true }) },
          ),
        )}
        noValidate
      >
        {!inv.existingUser ? <TextField control={form.control} name="name" label="Your name" autoComplete="name" placeholder={inv.name ?? ''} /> : null}
        <TextField control={form.control} name="password" label={inv.existingUser ? 'Your existing password' : 'Choose a password'} type="password" autoComplete={inv.existingUser ? 'current-password' : 'new-password'} required hint={inv.existingUser ? 'Confirm with the password of your existing account.' : 'At least 8 characters with a letter and a number.'} />
        <Button type="submit" className="w-full" loading={accept.isPending}>
          Accept invitation
        </Button>
      </form>
    </div>
  );
}
