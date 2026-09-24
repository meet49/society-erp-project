import * as React from 'react';
import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { http } from '@/lib/api-client';
import { onSocketEvent } from '@/lib/socket';
import { buildQueryParams, downloadFile } from '@/lib/utils';

const inv = (qc: ReturnType<typeof useQueryClient>, ...keys: readonly (readonly unknown[])[]) => Promise.all(keys.map((k) => qc.invalidateQueries({ queryKey: k })));

export function useGovernanceRealtime() {
  const qc = useQueryClient();
  React.useEffect(() => onSocketEvent('governance.changed', () => { for (const k of ['meetings', 'voting', 'committee']) qc.invalidateQueries({ queryKey: [k] }); }), [qc]);
}

// ------------------------------------------------------------------ meetings
export const useMeetings = (params: Record<string, unknown> = {}, enabled = true) => useQuery({ queryKey: ['meetings', 'list', params], queryFn: () => http.getPage<any>('/meetings', buildQueryParams(params)), placeholderData: keepPreviousData, enabled });
export const useMeeting = (id: string) => useQuery({ queryKey: ['meetings', 'detail', id], queryFn: () => http.get<any>(`/meetings/${id}`), enabled: Boolean(id) });
export const useMeetingStats = () => useQuery({ queryKey: ['meetings', 'stats'], queryFn: () => http.get<any>('/meetings/stats') });
export const useMeetingSettings = (enabled = true) => useQuery({ queryKey: ['meetings', 'settings'], queryFn: () => http.get<any>('/meetings/settings'), enabled });
export function useCreateMeeting() { const qc = useQueryClient(); return useMutation({ mutationFn: (input: any) => http.post<any>('/meetings', input), onSuccess: () => inv(qc, ['meetings']) }); }
export function useUpdateMeeting() { const qc = useQueryClient(); return useMutation({ mutationFn: ({ id, ...input }: any) => http.patch<any>(`/meetings/${id}`, input), onSuccess: () => inv(qc, ['meetings']) }); }
export function useDeleteMeeting() { const qc = useQueryClient(); return useMutation({ mutationFn: (id: string) => http.delete(`/meetings/${id}`), onSuccess: () => inv(qc, ['meetings']) }); }
export function useMeetingRsvp() { const qc = useQueryClient(); return useMutation({ mutationFn: ({ id, rsvp }: { id: string; rsvp: string }) => http.post<any>(`/meetings/${id}/rsvp`, { rsvp }), onSuccess: () => inv(qc, ['meetings']) }); }
export function useStartMeeting() { const qc = useQueryClient(); return useMutation({ mutationFn: (id: string) => http.post<any>(`/meetings/${id}/start`), onSuccess: () => inv(qc, ['meetings']) }); }
export function useMarkAttendance() { const qc = useQueryClient(); return useMutation({ mutationFn: ({ id, attendees }: { id: string; attendees: any[] }) => http.post<any>(`/meetings/${id}/attendance`, { attendees }), onSuccess: () => inv(qc, ['meetings']) }); }
export function useRecordMinutes() { const qc = useQueryClient(); return useMutation({ mutationFn: ({ id, ...input }: any) => http.post<any>(`/meetings/${id}/minutes`, input), onSuccess: () => inv(qc, ['meetings']) }); }
export function usePublishMinutes() { const qc = useQueryClient(); return useMutation({ mutationFn: (id: string) => http.post<any>(`/meetings/${id}/minutes/publish`), onSuccess: () => inv(qc, ['meetings']) }); }
export function useCancelMeeting() { const qc = useQueryClient(); return useMutation({ mutationFn: ({ id, reason }: { id: string; reason?: string }) => http.post<any>(`/meetings/${id}/cancel`, { reason }), onSuccess: () => inv(qc, ['meetings']) }); }
export function useOpenResolutionVote() { const qc = useQueryClient(); return useMutation({ mutationFn: ({ id, ...input }: { id: string; resolutionKey: string; endAt: string }) => http.post<any>(`/meetings/${id}/resolutions/vote`, input), onSuccess: () => inv(qc, ['meetings'], ['voting']) }); }
export function useDownloadIcs() { return useMutation({ mutationFn: async (id: string) => { const { blob, filename } = await http.blob(`/meetings/${id}/ics`); downloadFile(blob, filename ?? 'meeting.ics'); } }); }

// ------------------------------------------------------------------ voting
export const useVotings = (params: Record<string, unknown> = {}, enabled = true) => useQuery({ queryKey: ['voting', 'list', params], queryFn: () => http.getPage<any>('/voting', buildQueryParams(params)), placeholderData: keepPreviousData, enabled });
export const useVoting = (id: string) => useQuery({ queryKey: ['voting', 'detail', id], queryFn: () => http.get<any>(`/voting/${id}`), enabled: Boolean(id) });
export const useVotingResults = (id: string, enabled = true) => useQuery({ queryKey: ['voting', 'results', id], queryFn: () => http.get<any>(`/voting/${id}/results`), enabled: Boolean(id) && enabled });
export function useCreateVoting() { const qc = useQueryClient(); return useMutation({ mutationFn: (input: any) => http.post<any>('/voting', input), onSuccess: () => inv(qc, ['voting']) }); }
export function useOpenVoting() { const qc = useQueryClient(); return useMutation({ mutationFn: ({ id, endAt }: { id: string; endAt?: string | null }) => http.post<any>(`/voting/${id}/open`, { endAt }), onSuccess: () => inv(qc, ['voting']) }); }
export function useCloseVoting() { const qc = useQueryClient(); return useMutation({ mutationFn: (id: string) => http.post<any>(`/voting/${id}/close`), onSuccess: () => inv(qc, ['voting'], ['meetings']) }); }
export function useCancelVoting() { const qc = useQueryClient(); return useMutation({ mutationFn: (id: string) => http.post<any>(`/voting/${id}/cancel`), onSuccess: () => inv(qc, ['voting']) }); }
export function useDeleteVoting() { const qc = useQueryClient(); return useMutation({ mutationFn: (id: string) => http.delete(`/voting/${id}`), onSuccess: () => inv(qc, ['voting']) }); }
export function useCastBallot() { const qc = useQueryClient(); return useMutation({ mutationFn: ({ id, choices }: { id: string; choices: string[] }) => http.post<any>(`/voting/${id}/vote`, { choices }), onSuccess: () => inv(qc, ['voting']) }); }

// ------------------------------------------------------------------ committee
export const useCommittee = (status?: string) => useQuery({ queryKey: ['committee', 'list', status ?? ''], queryFn: () => http.get<any[]>('/committee', { params: status ? { status } : undefined }) });
export const useCommitteeOverview = () => useQuery({ queryKey: ['committee', 'overview'], queryFn: () => http.get<any>('/committee/overview') });
export const useCommitteePositions = () => useQuery({ queryKey: ['committee', 'positions'], queryFn: () => http.get<any[]>('/committee/positions'), staleTime: 5 * 60_000 });
export function useAddCommitteeMember() { const qc = useQueryClient(); return useMutation({ mutationFn: (input: any) => http.post<any>('/committee', input), onSuccess: () => inv(qc, ['committee']) }); }
export function useUpdateCommitteeMember() { const qc = useQueryClient(); return useMutation({ mutationFn: ({ id, ...input }: any) => http.patch<any>(`/committee/${id}`, input), onSuccess: () => inv(qc, ['committee']) }); }
export function useRemoveCommitteeMember() { const qc = useQueryClient(); return useMutation({ mutationFn: (id: string) => http.delete(`/committee/${id}`), onSuccess: () => inv(qc, ['committee']) }); }
export function useStartHandover() { const qc = useQueryClient(); return useMutation({ mutationFn: (input: { note?: string; checklist?: string[] }) => http.post<any>('/committee/handover/start', input), onSuccess: () => inv(qc, ['committee']) }); }
export function useTickHandover() { const qc = useQueryClient(); return useMutation({ mutationFn: (input: { key: string; done: boolean }) => http.post<any>('/committee/handover/checklist', input), onSuccess: () => inv(qc, ['committee']) }); }
export function useCompleteHandover() { const qc = useQueryClient(); return useMutation({ mutationFn: (input: { termStart?: string; termEnd?: string | null; note?: string }) => http.post<any>('/committee/handover/complete', input), onSuccess: () => inv(qc, ['committee']) }); }
