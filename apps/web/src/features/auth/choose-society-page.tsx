import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Building2, ShieldCheck, ChevronRight, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/common/empty-state';
import { useAuth, useLogout, useSwitchContext } from '@/hooks/use-auth';
import { landingPath } from '@/hooks/use-access';

export default function ChooseSocietyPage() {
  const { context } = useAuth();
  const switchCtx = useSwitchContext();
  const logout = useLogout();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const societies = context?.user.societies ?? [];
  const isPlatform = Boolean(context?.user.isPlatformAdmin);

  useEffect(() => {
    if (params.get('platform') && isPlatform && context?.landing !== 'PLATFORM') {
      switchCtx.mutate({ platform: true }, { onSuccess: () => navigate('/admin', { replace: true }) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Choose a workspace</h1>
        <p className="text-sm text-muted-foreground">Signed in as {context?.user.email}</p>
      </div>
      {isPlatform ? (
        <button type="button" onClick={() => switchCtx.mutate({ platform: true }, { onSuccess: () => navigate('/admin', { replace: true }) })} className="flex w-full items-center gap-3 rounded-lg border p-4 text-left transition-colors hover:bg-accent" disabled={switchCtx.isPending}>
          <ShieldCheck className="h-5 w-5 text-primary" />
          <span className="flex-1">
            <span className="block text-sm font-semibold">Platform console</span>
            <span className="block text-xs text-muted-foreground">Manage societies, plans, subscriptions and the website</span>
          </span>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </button>
      ) : null}
      {societies.length ? (
        <ul className="space-y-2">
          {societies.map((s) => (
            <li key={s.id}>
              <button type="button" onClick={() => switchCtx.mutate({ societyId: s.id }, { onSuccess: (data) => navigate(landingPath(data.context.landing, true, false), { replace: true }) })} className="flex w-full items-center gap-3 rounded-lg border p-4 text-left transition-colors hover:bg-accent" disabled={switchCtx.isPending}>
                {s.logoUrl ? <img src={s.logoUrl} alt="" className="h-9 w-9 rounded-md object-cover" /> : <Building2 className="h-5 w-5 text-primary" />}
                <span className="flex-1">
                  <span className="block text-sm font-semibold">{s.name}</span>
                  <span className="mt-0.5 flex flex-wrap gap-1">
                    {s.roleKeys.map((r) => (
                      <Badge key={r} variant="secondary" className="text-[10px]">
                        {r.replace(/_/g, ' ')}
                      </Badge>
                    ))}
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </button>
            </li>
          ))}
        </ul>
      ) : !isPlatform ? (
        <EmptyState title="No society access yet" description="Your account is not a member of any society. Ask your committee for an invitation, or create a new society." action={<Button onClick={() => navigate('/signup')}>Create a society</Button>} />
      ) : null}
      <Button variant="ghost" className="w-full" onClick={() => logout.mutate(undefined, { onSettled: () => navigate('/login') })}>
        <LogOut /> Sign out
      </Button>
    </div>
  );
}
