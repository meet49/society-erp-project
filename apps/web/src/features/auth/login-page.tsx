import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { loginSchema, type LoginInput } from '@society-erp/shared';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { TextField } from '@/components/common/form';
import { useLogin } from '@/hooks/use-auth';
import { landingPath } from '@/hooks/use-access';
import { getErrorMessage } from '@/lib/errors';

export default function LoginPage() {
  const login = useLogin();
  const navigate = useNavigate();
  const location = useLocation();
  const form = useForm<LoginInput>({ resolver: zodResolver(loginSchema), defaultValues: { email: '', password: '' } });
  const from = (location.state as { from?: string } | null)?.from;

  const onSubmit = (values: LoginInput) =>
    login.mutate(values, {
      onSuccess: (data) => {
        const ctx = data.context;
        const target = from && !from.startsWith('/login') ? from : landingPath(ctx.landing, Boolean(ctx.society), ctx.user.isPlatformAdmin, ctx.society?.onboardingCompleted ?? true);
        navigate(target, { replace: true });
      },
    });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Welcome back</h1>
        <p className="text-sm text-muted-foreground">Sign in to your society workspace.</p>
      </div>
      {login.isError ? (
        <Alert variant="destructive">
          <AlertDescription>{getErrorMessage(login.error)}</AlertDescription>
        </Alert>
      ) : null}
      <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)} noValidate>
        <TextField control={form.control} name="email" label="Email" type="email" autoComplete="email" autoFocus required />
        <TextField control={form.control} name="password" label="Password" type="password" autoComplete="current-password" required />
        <div className="flex items-center justify-between text-sm">
          <Link to="/forgot-password" className="text-primary hover:underline">
            Forgot password?
          </Link>
        </div>
        <Button type="submit" className="w-full" loading={login.isPending}>
          Sign in
        </Button>
      </form>
      <p className="text-center text-sm text-muted-foreground">
        New society?{' '}
        <Link to="/signup" className="text-primary hover:underline">
          Start a free trial
        </Link>
      </p>
    </div>
  );
}
