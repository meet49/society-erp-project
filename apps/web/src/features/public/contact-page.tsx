import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useSearchParams } from 'react-router-dom';
import { CheckCircle2, Mail, Phone, MapPin, Clock } from 'lucide-react';
import { leadSchema, publicSupportTicketSchema, type LeadInput } from '@society-erp/shared';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TextField, TextareaField, SelectField, applyServerErrors } from '@/components/common/form';
import { useCreateLead, useCreatePublicTicket, usePublicSettings } from '@/hooks/use-public';
import { handleApiError } from '@/lib/errors';
import { useT } from '@/lib/i18n';

type TicketInput = z.infer<typeof publicSupportTicketSchema>;

export default function ContactPage() {
  const [params] = useSearchParams();
  const settings = usePublicSettings();
  const { t, locale } = useT();
  const contact = settings.data?.['landing.contact'] ?? {};
  const createLead = useCreateLead();
  const createTicket = useCreatePublicTicket();
  const initialType = (params.get('type') as LeadInput['type']) || 'GENERAL';

  const leadForm = useForm<LeadInput>({ resolver: zodResolver(leadSchema), defaultValues: { type: initialType, name: '', email: '', phone: '', societyName: '', city: '', message: '', source: 'website', planSlug: params.get('plan') ?? undefined } });
  const ticketForm = useForm<TicketInput>({ resolver: zodResolver(publicSupportTicketSchema), defaultValues: { name: '', email: '', phone: '', subject: '', message: '' } });

  return (
    <div className="relative overflow-hidden">
      <div className="aurora" aria-hidden>
        <i />
      </div>
      <div className="container relative grid gap-10 py-16 lg:grid-cols-[1fr_380px]" lang={locale}>
        <div>
          <span className="mb-5 block h-1 w-12 rounded-full bg-gradient-to-r from-primary to-sky-400" aria-hidden />
          <h1 className="display text-3xl font-semibold sm:text-4xl">{t('contact.title')}</h1>
          <p className="mt-3 text-lg text-muted-foreground">{t('contact.subtitle')}</p>
          <Tabs defaultValue={params.get('support') ? 'support' : 'enquiry'} className="mt-8">
            <TabsList>
              <TabsTrigger value="enquiry">{t('contact.tab.enquiry')}</TabsTrigger>
              <TabsTrigger value="support">{t('contact.tab.support')}</TabsTrigger>
            </TabsList>
            <TabsContent value="enquiry">
              {createLead.isSuccess ? (
                <Card>
                  <CardContent className="flex items-start gap-3 p-6">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 text-success" />
                    <div>
                      <p className="font-semibold">{t('contact.thanks')}</p>
                      <p className="text-sm text-muted-foreground">{t('contact.thanksDetail')}</p>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <form
                  className="grid gap-4 rounded-2xl border bg-card/80 p-5 backdrop-blur sm:grid-cols-2 sm:p-6"
                  onSubmit={leadForm.handleSubmit((values) =>
                    createLead.mutate(values, {
                      onError: (e) => {
                        if (!applyServerErrors(leadForm, e)) handleApiError(e);
                      },
                    }),
                  )}
                  noValidate
                >
                  <SelectField
                    control={leadForm.control}
                    name="type"
                    label={t('contact.want')}
                    options={[
                      { value: 'DEMO_REQUEST', label: t('contact.type.demo') },
                      { value: 'PLAN_ENQUIRY', label: t('contact.type.plans') },
                      { value: 'SALES', label: t('contact.type.sales') },
                      { value: 'GENERAL', label: t('contact.type.other') },
                    ]}
                    className="sm:col-span-2"
                  />
                  <TextField control={leadForm.control} name="name" label={t('contact.name')} required autoComplete="name" />
                  <TextField control={leadForm.control} name="email" label={t('contact.email')} type="email" required autoComplete="email" />
                  <TextField control={leadForm.control} name="phone" label={t('contact.phone')} type="tel" autoComplete="tel" />
                  <TextField control={leadForm.control} name="societyName" label={t('contact.society')} />
                  <TextField control={leadForm.control} name="city" label={t('contact.city')} />
                  <TextareaField control={leadForm.control} name="message" label={t('contact.message')} className="sm:col-span-2" rows={4} />
                  <div className="sm:col-span-2">
                    <Button type="submit" size="lg" loading={createLead.isPending}>
                      {t('contact.send')}
                    </Button>
                  </div>
                </form>
              )}
            </TabsContent>
            <TabsContent value="support">
              {createTicket.isSuccess ? (
                <Card>
                  <CardContent className="flex items-start gap-3 p-6">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 text-success" />
                    <div>
                      <p className="font-semibold">{t('contact.ticketCreated', { n: createTicket.data.ticketNumber })}</p>
                      <p className="text-sm text-muted-foreground">{t('contact.ticketDetail')}</p>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <form
                  className="grid gap-4 rounded-2xl border bg-card/80 p-5 backdrop-blur sm:grid-cols-2 sm:p-6"
                  onSubmit={ticketForm.handleSubmit((values) =>
                    createTicket.mutate(values, {
                      onError: (e) => {
                        if (!applyServerErrors(ticketForm, e)) handleApiError(e);
                      },
                    }),
                  )}
                  noValidate
                >
                  <TextField control={ticketForm.control} name="name" label={t('contact.name')} required />
                  <TextField control={ticketForm.control} name="email" label={t('contact.email')} type="email" required />
                  <TextField control={ticketForm.control} name="phone" label={t('contact.phone')} type="tel" />
                  <TextField control={ticketForm.control} name="subject" label={t('contact.subject')} required />
                  <TextareaField control={ticketForm.control} name="message" label={t('contact.describe')} className="sm:col-span-2" rows={5} required />
                  <div className="sm:col-span-2">
                    <Button type="submit" size="lg" loading={createTicket.isPending}>
                      {t('contact.submit')}
                    </Button>
                  </div>
                </form>
              )}
            </TabsContent>
          </Tabs>
        </div>
        <aside className="space-y-4 lg:pt-24">
          <Card className="card-hover">
            <CardContent className="space-y-4 p-6 text-sm">
              {contact.email ? (
                <p className="flex items-center gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Mail className="h-4 w-4" />
                  </span>
                  <a href={`mailto:${contact.email}`} className="hover:underline">
                    {contact.email}
                  </a>
                </p>
              ) : null}
              {contact.phone ? (
                <p className="flex items-center gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Phone className="h-4 w-4" />
                  </span>
                  {contact.phone}
                </p>
              ) : null}
              {contact.address ? (
                <p className="flex items-center gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <MapPin className="h-4 w-4" />
                  </span>
                  {contact.address}
                </p>
              ) : null}
              {contact.hours ? (
                <p className="flex items-center gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Clock className="h-4 w-4" />
                  </span>
                  {contact.hours}
                </p>
              ) : null}
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
