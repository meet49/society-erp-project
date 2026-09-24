import * as React from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Send, CheckCheck } from 'lucide-react';
import { PageHeader } from '@/components/common/page-header';
import { ErrorState } from '@/components/common/error-state';
import { PageSkeleton } from '@/components/common/loading-state';
import { PermissionGate, SubscriptionGate } from '@/components/common/gates';
import { Button } from '@/components/ui/button';
import { useRespondSurvey, useSurvey } from '@/hooks/use-community';
import { formatDateTime } from '@/lib/utils';
import { getErrorMessage, isApiError } from '@/lib/errors';
import { QuestionField, useAnswers, validateLocally } from '@/features/community/survey-shared';

/** Answer (or edit the answers to) a survey. */
export default function MySurveyPage() {
  const { id = '' } = useParams();
  const survey = useSurvey(id);
  const respond = useRespondSurvey();
  const { answers, set } = useAnswers(survey.data?.myResponse?.answers);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  if (survey.isLoading) return <PageSkeleton />;
  if (survey.isError || !survey.data) return <ErrorState error={survey.error} onRetry={() => survey.refetch()} />;
  const s = survey.data;
  const submit = () => {
    const local = validateLocally(s.questions, answers);
    setErrors(local);
    if (Object.keys(local).length) return toast.error('Please answer the required questions');
    respond.mutate({ id, answers: Object.entries(answers).map(([questionKey, value]) => ({ questionKey, value })) }, {
      onSuccess: () => toast.success(s.myResponse ? 'Your answers were updated' : 'Thanks for your feedback!'),
      onError: (e) => { const fields = isApiError(e) ? (e as any).fields : undefined; if (fields) setErrors(Object.fromEntries(Object.entries(fields as Record<string, unknown>).map(([k, v]) => [k, Array.isArray(v) ? String(v[0]) : String(v)]))); toast.error(getErrorMessage(e)); },
    });
  };
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={s.title} description={s.description ?? (s.endAt ? `Closes ${formatDateTime(s.endAt)}` : undefined)} actions={<Button asChild variant="ghost"><Link to="/app/my/surveys"><ArrowLeft /> All surveys</Link></Button>} />
      {s.myResponse ? <p className="mb-4 flex items-center gap-2 rounded-md bg-success/10 p-3 text-sm"><CheckCheck className="h-4 w-4 text-success" /> You responded on {formatDateTime(s.myResponse.submittedAt)}.{s.isOpen ? ' You can change your answers until the survey closes.' : ''}</p> : null}
      <div className="space-y-3">{s.questions.map((q: any) => <QuestionField key={q.key} q={q} value={answers[q.key]} onChange={(v) => set(q.key, v)} error={errors[q.key]} />)}</div>
      {s.isOpen ? <PermissionGate permission="surveys:respond"><SubscriptionGate><div className="mt-4 flex justify-end"><Button loading={respond.isPending} onClick={submit}><Send /> {s.myResponse ? 'Update answers' : 'Submit'}</Button></div></SubscriptionGate></PermissionGate> : <p className="mt-4 text-sm text-muted-foreground">This survey is closed.</p>}
    </div>
  );
}
