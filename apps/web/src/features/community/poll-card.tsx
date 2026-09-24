import * as React from 'react';
import { toast } from 'sonner';
import { Vote, Lock, Users } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { StatusBadge } from '@/components/common/status-badge';
import { useVote } from '@/hooks/use-community';
import { cn, formatDateTime, formatRelative } from '@/lib/utils';
import { getErrorMessage } from '@/lib/errors';

/** A poll as residents see it: vote, change your vote while open, see results when allowed. */
export function PollCard({ poll, actions }: { poll: any; actions?: React.ReactNode }) {
  const vote = useVote();
  const [selected, setSelected] = React.useState<string[]>(poll.myVote ?? []);
  React.useEffect(() => { setSelected(poll.myVote ?? []); }, [poll.myVote]);
  const total = poll.voteCount ?? 0;
  const canVote = poll.isOpen;
  const pick = (key: string) => setSelected(poll.allowMultiple ? (selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key]) : [key]);
  const submit = () => vote.mutate({ id: poll.id, optionKeys: selected }, { onSuccess: () => toast.success(poll.myVote ? 'Vote updated' : 'Vote recorded'), onError: (e) => toast.error(getErrorMessage(e)) });
  const changed = JSON.stringify([...selected].sort()) !== JSON.stringify([...(poll.myVote ?? [])].sort());
  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold">{poll.question}</p>
            {poll.description ? <p className="text-sm text-muted-foreground">{poll.description}</p> : null}
            <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><StatusBadge status={poll.status} />{poll.anonymous ? <Badge variant="outline"><Lock className="mr-1 h-3 w-3" />Anonymous</Badge> : null}{poll.oneVotePerUnit ? <Badge variant="outline">One vote per unit</Badge> : null}{poll.allowMultiple ? <Badge variant="outline">Pick several</Badge> : null}<span>{poll.audienceLabel}</span>{poll.endAt ? <span>· {poll.status === 'CLOSED' ? 'closed' : 'closes'} {formatRelative(poll.endAt)}</span> : null}</p>
          </div>
          {actions}
        </div>
        <ul className="space-y-2">
          {poll.options.map((o: any) => {
            const pct = poll.resultsVisible && total ? Math.round(((o.votes ?? 0) / total) * 100) : null;
            const mine = (poll.myVote ?? []).includes(o.key);
            return (
              <li key={o.key}>
                <label className={cn('flex items-center gap-3 rounded-md border p-2 text-sm', canVote && 'cursor-pointer hover:border-primary', selected.includes(o.key) && canVote && 'border-primary bg-primary/5')}>
                  {canVote ? <Checkbox checked={selected.includes(o.key)} onCheckedChange={() => pick(o.key)} /> : null}
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2"><span className="truncate">{o.label}{mine ? <Badge variant="info" className="ml-2">Your vote</Badge> : null}</span>{pct != null ? <span className="text-xs text-muted-foreground">{o.votes} · {pct}%</span> : null}</span>
                    {pct != null ? <Progress value={pct} className="mt-1" tone={mine ? 'primary' : 'primary'} /> : null}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><Users className="h-3 w-3" />{poll.resultsVisible ? `${total} vote${total === 1 ? '' : 's'}${poll.eligibleCount ? ` of ${poll.eligibleCount} eligible` : ''}` : 'Results are shown when the poll closes'}{poll.endAt && poll.status === 'OPEN' ? ` · until ${formatDateTime(poll.endAt)}` : ''}</span>
          {canVote ? <Button size="sm" loading={vote.isPending} disabled={!selected.length || !changed} onClick={submit}><Vote /> {poll.myVote ? 'Update vote' : 'Vote'}</Button> : null}
        </div>
      </CardContent>
    </Card>
  );
}
