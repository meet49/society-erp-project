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

type TicketInput = z.infer<typeof publicSupportTicketSchema>;

export default function ContactPage() {
  const [params] = useSearchParams();
  const settings = usePublicSettings();
  const contact = settings.data?.['landing.contact'] ?? {};
  const createLead = useCreateLead();
  const createTicket = useCreatePublicTicket();
  const initialType = (params.get('type') as LeadInput['type']) || 'GENERAL';

  const leadForm = useForm<LeadInput>({ resolver: zodResolver(leadSchema), defaultValues: { type: initialType, name: '', email: '', phone: '', societyName: '', city: '', message: '', source: 'website', planSlug: params.get('plan') ?? undefined } });
  const ticketForm = useForm<TicketInput>({ resolver: zodResolver(publicSupportTicketSchema), defaultValues: { name: '', email: '', phone: '', subject: '', message: '' } });

  return (
    <div className="container grid gap-10 py-16 lg:grid-cols-[1fr_380px]">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Talk to us</h1>
        <p className="mt-2 text-muted-foreground">Request a demo, ask about plans, or get help with an existing account.</p>
        <Tabs defaultValue={params.get('support') ? 'support' : 'enquiry'} className="mt-8">
          <TabsList>
            <TabsTrigger value="enquiry">Sales & demo</TabsTrigger>
            <TabsTrigger value="support">Support request</TabsTrigger>
          </TabsList>
          <TabsContent value="enquiry">
            {createLead.isSuccess ? (
              <Card>
                <CardContent className="flex items-start gap-3 p-6">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 text-success" />
                  <div>
                    <p className="font-semibold">Thanks, we received your request.</p>
                    <p className="text-sm text-muted-foreground">Our team will contact you within one business day.</p>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <form className="grid gap-4 sm:grid-cols-2" onSubmit={leadForm.handleSubmit((values) => createLead.mutate(values, { onError: (e) => { if (!applyServerErrors(leadForm, e)) handleApiError(e); } }))} noValidate>
                <SelectField control={leadForm.control} name="type" label="I want to" options={[{ value: 'DEMO_REQUEST', label: 'Request a demo' }, { value: 'PLAN_ENQUIRY', label: 'Ask about plans' }, { value: 'SALES', label: 'Talk to sales' }, { value: 'GENERAL', label: 'Something else' }]} className="sm:col-span-2" />
                <TextField control={leadForm.control} name="name" label="Your name" required autoComplete="name" />
                <TextField control={leadForm.control} name="email" label="Email" type="email" required autoComplete="email" />
                <TextField control={leadForm.control} name="phone" label="Phone" type="tel" autoComplete="tel" />
                <TextField control={leadForm.control} name="societyName" label="Society name" />
                <TextField control={leadForm.control} name="city" label="City" />
                <TextareaField control={leadForm.control} name="message" label="Message" className="sm:col-span-2" rows={4} />
                <div className="sm:col-span-2">
                  <Button type="submit" loading={createLead.isPending}>
                    Send request
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
                    <p className="font-semibold">Ticket {createTicket.data.ticketNumber} created.</p>
                    <p className="text-sm text-muted-foreground">We have emailed you a confirmation and will reply shortly.</p>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <form className="grid gap-4 sm:grid-cols-2" onSubmit={ticketForm.handleSubmit((values) => createTicket.mutate(values, { onError: (e) => { if (!applyServerErrors(ticketForm, e)) handleApiError(e); } }))} noValidate>
                <TextField control={ticketForm.control} name="name" label="Your name" required />
                <TextField control={ticketForm.control} name="email" label="Email" type="email" required />
                <TextField control={ticketForm.control} name="phone" label="Phone" type="tel" />
                <TextField control={ticketForm.control} name="subject" label="Subject" required />
                <TextareaField control={ticketForm.control} name="message" label="Describe the issue" className="sm:col-span-2" rows={5} required />
                <div className="sm:col-span-2">
                  <Button type="submit" loading={createTicket.isPending}>
                    Submit ticket
                  </Button>
                </div>
              </form>
            )}
          </TabsContent>
        </Tabs>
      </div>
      <aside className="space-y-4">
        <Card>
          <CardContent className="space-y-4 p-6 text-sm">
            {contact.email ? (
              <p className="flex items-center gap-3">
                <Mail className="h-4 w-4 text-primary" /> <a href={`mailto:${contact.email}`}>{contact.email}</a>
              </p>
            ) : null}
            {contact.phone ? (
              <p className="flex items-center gap-3">
                <Phone className="h-4 w-4 text-primary" /> {contact.phone}
              </p>
            ) : null}
            {contact.address ? (
              <p className="flex items-center gap-3">
                <MapPin className="h-4 w-4 text-primary" /> {contact.address}
              </p>
            ) : null}
            {contact.hours ? (
              <p className="flex items-center gap-3">
                <Clock className="h-4 w-4 text-primary" /> {contact.hours}
              </p>
            ) : null}
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}
