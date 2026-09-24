import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { passwordSchema } from '@society-erp/shared';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { TextField } from '@/components/common/form';
import { useResetPassword } from '@/hooks/use-auth';
import { getErrorMessage } from '@/lib/errors';

const schema = z.object({ password: passwordSchema, confirm: z.string() }).refine((v) => v.password === v.confirm, { message: 'Passwords do not match', path: ['confirm'] });
type Input = z.infer<typeof schema>;

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const reset = useResetPassword();
  const navigate = useNavigate();
  const form = useForm<Input>({ resolver: zodResolver(schema), defaultValues: { password: '', confirm: '' } });
  if (!token) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          This reset link is incomplete.{' '}
          <Link to="/forgot-password" className="underline">
            Request a new one
          </Link>
          .
        </AlertDescription>
      </Alert>
    );
  }
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Choose a new password</h1>
        <p className="text-sm text-muted-foreground">All other sessions will be signed out.</p>
      </div>
      {reset.isError ? (
        <Alert variant="destructive">
          <AlertDescription>{getErrorMessage(reset.error)}</AlertDescription>
        </Alert>
      ) : null}
      <form
        className="space-y-4"
        onSubmit={form.handleSubmit((v) =>
          reset.mutate(
            { token, password: v.password },
            {
              onSuccess: () => {
                toast.success('Password updated. Please sign in.');
                navigate('/login', { replace: true });
              },
            },
          ),
        )}
        noValidate
      >
        <TextField control={form.control} name="password" label="New password" type="password" autoComplete="new-password" required />
        <TextField control={form.control} name="confirm" label="Confirm password" type="password" autoComplete="new-password" required />
        <Button type="submit" className="w-full" loading={reset.isPending}>
          Update password
        </Button>
      </form>
    </div>
  );
}
