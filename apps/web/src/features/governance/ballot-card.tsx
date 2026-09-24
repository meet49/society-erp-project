import * as React from 'react';
import { toast } from 'sonner';
import { CheckSquare, Lock, Users, Trophy } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { StatusBadge } from '@/components/common/status-badge';
import { useCastBallot } from '@/hooks/use-governance';
import { cn, formatDateTime, formatRelative, formatStatus } from '@/lib/utils';
import { getErrorMessage } from '@/lib/errors';

/** A resolution or election as a voter sees it. */
export function BallotCard({ voting, actions }: { voting: any; actions?: React.ReactNode }) {
  const cast = useCastBallot();
  const [selected, setSelected] = React.useState<string[]>(voting.myBallot ?? []);
  React.useEffect(() => { setSelected(voting.myBallot ?? []); }, [voting.myBallot]);
  const election = voting.type === 'ELECTION';
  const canVote = voting.isOpen;
  const total = voting.voteCount ?? 0;
  const pick = (key: string) => setSelected(election ? (selected.includes(key) ? selected.filter((k) => k !== key) : selected.length < voting.seats ? [...selected, key] : selected) : [key]);
  const submit = () => cast.mutate({ id: voting.id, choices: selected }, { onSuccess: () => toast.success(voting.myBallot ? 'Ballot updated' : 'Ballot cast'), onError: (e) => toast.error(getErrorMessage(e)) });
  const changed = JSON.stringify([...selected].sort()) !== JSON.stringify([...(voting.myBallot ?? [])].sort());
  const winners: string[] = voting.results?.winners ?? [];
  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2 font-semibold"><Badge variant={election ? 'info' : 'outline'}>{election ? 'Election' : 'Resolution'}</Badge>{voting.title}</p>
            {voting.description ? <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{voting.description}</p> : null}
            <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><StatusBadge status={voting.status} />{voting.anonymous ? <Badge variant="outline"><Lock className="mr-1 h-3 w-3" />Secret ballot</Badge> : null}{voting.oneVotePerUnit ? <Badge variant="outline">One ballot per unit</Badge> : null}{election ? <Badge variant="outline">{voting.seats} seat{voting.seats === 1 ? '' : 's'}</Badge> : null}<span>{voting.audienceLabel}</span>{voting.endAt ? <span>· {voting.status === 'CLOSED' ? 'closed' : 'closes'} {formatRelative(voting.endAt)}</span> : null}{voting.meetingId?.title ? <span>· from {voting.meetingId.title}</span> : null}</p>
          </div>
          {actions}
        </div>
        {voting.status === 'CLOSED' && voting.results?.outcome ? <p className={cn('rounded-md p-2 text-sm font-medium', ['PASSED', 'ELECTED'].includes(voting.results.outcome) ? 'bg-success/10 text-success' : 'bg-muted')}>Outcome: {formatStatus(voting.results.outcome)}{voting.results.turnoutPercent != null ? ` · turnout ${voting.results.turnoutPercent}%` : ''}{voting.results.quorumMet === false ? ' · quorum not met' : ''}</p> : null}
        <ul className="space-y-2">
          {voting.options.map((o: any) => {
            const pct = voting.resultsVisible && total ? Math.round(((o.votes ?? 0) / total) * 100) : null;
            const mine = (voting.myBallot ?? []).includes(o.key);
            return (
              <li key={o.key}>
                <label className={cn('flex items-center gap-3 rounded-md border p-2 text-sm', canVote && 'cursor-pointer hover:border-primary', selected.includes(o.key) && canVote && 'border-primary bg-primary/5', winners.includes(o.key) && 'border-success')}>
                  {canVote ? <Checkbox checked={selected.includes(o.key)} onCheckedChange={() => pick(o.key)} /> : null}
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2"><span className="truncate">{winners.includes(o.key) ? <Trophy className="mr-1 inline h-3.5 w-3.5 text-success" /> : null}{o.label}{o.unitCode ? <span className="text-muted-foreground"> · {o.unitCode}</span> : null}{mine ? <Badge variant="info" className="ml-2">Your ballot</Badge> : null}</span>{pct != null ? <span className="text-xs text-muted-foreground">{o.votes} · {pct}%</span> : null}</span>
                    {o.statement ? <span className="block text-xs text-muted-foreground">{o.statement}</span> : null}
                    {pct != null ? <Progress value={pct} className="mt-1" tone={winners.includes(o.key) ? 'success' : 'primary'} /> : null}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><Users className="h-3 w-3" />{voting.resultsVisible ? `${total} ballot${total === 1 ? '' : 's'}${voting.eligibleCount ? ` of ${voting.eligibleCount} eligible` : ''}` : 'Counts are published when voting closes'}{voting.endAt && voting.status === 'OPEN' ? ` · until ${formatDateTime(voting.endAt)}` : ''}</span>
          {canVote ? <Button size="sm" loading={cast.isPending} disabled={!selected.length || !changed} onClick={submit}><CheckSquare /> {voting.myBallot ? 'Update ballot' : 'Cast ballot'}</Button> : null}
        </div>
      </CardContent>
    </Card>
  );
}
