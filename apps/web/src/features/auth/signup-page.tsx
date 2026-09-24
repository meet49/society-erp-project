import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { signupSchema, SocietyTypes, type SignupInput } from '@society-erp/shared';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { TextField, SelectField, CheckboxField, applyServerErrors } from '@/components/common/form';
import { useSignup, useSignupConfig } from '@/hooks/use-public';
import { getErrorMessage, handleApiError } from '@/lib/errors';
import { formatCurrency, formatStatus, cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

export default function SignupPage() {
  const config = useSignupConfig();
  const signup = useSignup();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const form = useForm<SignupInput>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      society: { name: '', type: 'APARTMENT', city: '', totalUnits: undefined },
      admin: { name: '', email: '', phone: '', password: '' },
      planId: '',
      billingCycle: (params.get('cycle') as 'MONTHLY' | 'ANNUAL') || 'MONTHLY',
      acceptTerms: false as unknown as true,
    },
  });

  useEffect(() => {
    if (!config.data || form.getValues('planId')) return;
    const bySlug = config.data.plans.find((p) => p.slug === params.get('plan'));
    form.setValue('planId', bySlug?.id ?? config.data.defaultPlanId ?? config.data.plans[0]?.id ?? '');
  }, [config.data, form, params]);

  const planId = form.watch('planId');
  const cycle = form.watch('billingCycle');
  const plans = config.data?.plans ?? [];

  if (config.isLoading) return <Skeleton className="h-96" />;
  if (config.data && !config.data.enabled) {
    return (
      <Alert>
        <AlertDescription>
          Self-service signup is currently disabled.{' '}
          <Link to="/contact" className="text-primary underline">
            Contact us
          </Link>{' '}
          to get onboarded.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Create your society workspace</h1>
        <p className="text-sm text-muted-foreground">Free {config.data?.trialDays ?? 14}-day trial. No credit card required.</p>
      </div>
      {signup.isError ? (
        <Alert variant="destructive">
          <AlertDescription>{getErrorMessage(signup.error)}</AlertDescription>
        </Alert>
      ) : null}
      <form
        className="space-y-5"
        onSubmit={form.handleSubmit((values) =>
          signup.mutate(values, {
            onSuccess: () => navigate('/app/onboarding', { replace: true }),
            onError: (e) => {
              if (!applyServerErrors(form, e)) handleApiError(e, { silent: true });
            },
          }),
        )}
        noValidate
      >
        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold">Plan</legend>
          <div className="flex gap-2 text-xs">
            {(['MONTHLY', 'ANNUAL'] as const).map((c) => (
              <button key={c} type="button" onClick={() => form.setValue('billingCycle', c)} className={cn('rounded-full border px-3 py-1', cycle === c && 'border-primary bg-primary text-primary-foreground')}>
                {formatStatus(c)}
              </button>
            ))}
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            {plans.map((p) => (
              <button key={p.id} type="button" onClick={() => form.setValue('planId', p.id)} className={cn('rounded-lg border p-3 text-left text-sm transition-colors hover:bg-accent', planId === p.id && 'border-primary ring-1 ring-primary')} aria-pressed={planId === p.id}>
                <p className="font-semibold">{p.name}</p>
                <p className="text-xs text-muted-foreground">
                  {formatCurrency(cycle === 'ANNUAL' ? p.annualPrice : p.monthlyPrice, p.currency)} / {cycle === 'ANNUAL' ? 'year' : 'month'}
                </p>
              </button>
            ))}
          </div>
          {form.formState.errors.planId ? <p className="text-xs text-destructive">{form.formState.errors.planId.message}</p> : null}
        </fieldset>

        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className="mb-1 text-sm font-semibold">Society</legend>
          <TextField control={form.control} name="society.name" label="Society name" required className="sm:col-span-2" />
          <SelectField control={form.control} name="society.type" label="Type" options={SocietyTypes.map((t) => ({ value: t, label: formatStatus(t) }))} />
          <TextField control={form.control} name="society.city" label="City" required />
          <TextField control={form.control} name="society.totalUnits" label="Approx. units" type="number" min={1} />
          <TextField control={form.control} name="society.pincode" label="PIN code" />
        </fieldset>

        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className="mb-1 text-sm font-semibold">Administrator account</legend>
          <TextField control={form.control} name="admin.name" label="Your name" required autoComplete="name" />
          <TextField control={form.control} name="admin.phone" label="Phone" type="tel" autoComplete="tel" />
          <TextField control={form.control} name="admin.email" label="Email" type="email" required autoComplete="email" className="sm:col-span-2" />
          <TextField control={form.control} name="admin.password" label="Password" type="password" required autoComplete="new-password" hint="At least 8 characters with a letter and a number." className="sm:col-span-2" />
        </fieldset>

        <CheckboxField control={form.control} name="acceptTerms" label="I agree to the terms of service and privacy policy." />
        <Button type="submit" className="w-full" loading={signup.isPending}>
          Create workspace
        </Button>
      </form>
      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link to="/login" className="text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
