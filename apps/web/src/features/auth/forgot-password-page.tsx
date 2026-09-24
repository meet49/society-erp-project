import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'react-router-dom';
import { z } from 'zod';
import { forgotPasswordSchema } from '@society-erp/shared';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { TextField } from '@/components/common/form';
import { useForgotPassword } from '@/hooks/use-auth';
import { getErrorMessage } from '@/lib/errors';

type Input = z.infer<typeof forgotPasswordSchema>;

export default function ForgotPasswordPage() {
  const forgot = useForgotPassword();
  const form = useForm<Input>({ resolver: zodResolver(forgotPasswordSchema), defaultValues: { email: '' } });
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Reset your password</h1>
        <p className="text-sm text-muted-foreground">Enter your email and we will send you a reset link.</p>
      </div>
      {forgot.isSuccess ? (
        <Alert variant="success">
          <AlertDescription>If an account exists for that email, a reset link is on its way. It is valid for a limited time.</AlertDescription>
        </Alert>
      ) : (
        <form className="space-y-4" onSubmit={form.handleSubmit((v) => forgot.mutate(v))} noValidate>
          {forgot.isError ? (
            <Alert variant="destructive">
              <AlertDescription>{getErrorMessage(forgot.error)}</AlertDescription>
            </Alert>
          ) : null}
          <TextField control={form.control} name="email" label="Email" type="email" autoComplete="email" autoFocus required />
          <Button type="submit" className="w-full" loading={forgot.isPending}>
            Send reset link
          </Button>
        </form>
      )}
      <p className="text-center text-sm text-muted-foreground">
        <Link to="/login" className="text-primary hover:underline">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
