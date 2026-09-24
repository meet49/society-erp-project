import * as React from 'react';
import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { http } from '@/lib/api-client';
import { onSocketEvent } from '@/lib/socket';
import { buildQueryParams, downloadFile } from '@/lib/utils';

const inv = (qc: ReturnType<typeof useQueryClient>, ...keys: readonly (readonly unknown[])[]) => Promise.all(keys.map((k) => qc.invalidateQueries({ queryKey: k })));

export interface AudienceValue { type: 'ALL' | 'BUILDING' | 'UNIT_GROUP' | 'ROLE' | 'CUSTOM'; buildingIds: string[]; unitIds: string[]; roleKeys: string[]; userIds: string[]; residentTypes: string[] }
export const ALL_AUDIENCE: AudienceValue = { type: 'ALL', buildingIds: [], unitIds: [], roleKeys: [], userIds: [], residentTypes: [] };
export function useAudiencePreview() { return useMutation({ mutationFn: (audience: AudienceValue) => http.post<{ count: number; label: string }>('/notices/audience/preview', { audience }) }); }

/** Keeps every community list live: notices, feed, events, polls and surveys share one socket event. */
export function useCommunityRealtime() {
  const qc = useQueryClient();
  React.useEffect(() => onSocketEvent('community.changed', () => { for (const k of ['notices', 'community', 'events', 'polls', 'surveys']) qc.invalidateQueries({ queryKey: [k] }); }), [qc]);
}

// ------------------------------------------------------------------ notices
export const useNotices = (params: Record<string, unknown> = {}, enabled = true) => useQuery({ queryKey: ['notices', 'list', params], queryFn: () => http.getPage<any>('/notices', buildQueryParams(params)), placeholderData: keepPreviousData, enabled });
export const useNotice = (id: string) => useQuery({ queryKey: ['notices', 'detail', id], queryFn: () => http.get<any>(`/notices/${id}`), enabled: Boolean(id) });
export const useNoticeStats = () => useQuery({ queryKey: ['notices', 'stats'], queryFn: () => http.get<any>('/notices/stats') });
export const useNoticeSettings = (enabled = true) => useQuery({ queryKey: ['notices', 'settings'], queryFn: () => http.get<any>('/notices/settings'), enabled });
export const useNoticeCategories = () => useQuery({ queryKey: ['notices', 'categories'], queryFn: () => http.get<any[]>('/notices/categories'), staleTime: 5 * 60_000 });
export const useNoticeReaders = (id: string, enabled = true) => useQuery({ queryKey: ['notices', 'readers', id], queryFn: () => http.get<any>(`/notices/${id}/readers`), enabled: Boolean(id) && enabled });
export function useCreateNotice() { const qc = useQueryClient(); return useMutation({ mutationFn: (input: any) => http.post<any>('/notices', input), onSuccess: () => inv(qc, ['notices']) }); }
export function useUpdateNotice() { const qc = useQueryClient(); return useMutation({ mutationFn: ({ id, ...input }: any) => http.patch<any>(`/notices/${id}`, input), onSuccess: () => inv(qc, ['notices']) }); }
export function usePublishNotice() { const qc = useQueryClient(); return useMutation({ mutationFn: ({ id, publishAt }: { id: string; publishAt?: string | null }) => http.post<any>(`/notices/${id}/publish`, { publishAt }), onSuccess: () => inv(qc, ['notices']) }); }
export function useArchiveNotice() { const qc = useQueryClient(); return useMutation({ mutationFn: (id: string) => http.post<any>(`/notices/${id}/archive`), onSuccess: () => inv(qc, ['notices']) }); }
export function useDeleteNotice() { const qc = useQueryClient(); return useMutation({ mutationFn: (id: string) => http.delete(`/notices/${id}`), onSuccess: () => inv(qc, ['notices']) }); }
export function useAcknowledgeNotice() { const qc = useQueryClient(); return useMutation({ mutationFn: (id: string) => http.post<any>(`/notices/${id}/acknowledge`), onSuccess: () => inv(qc, ['notices']) }); }
export function useSaveNoticeSettings() { const qc = useQueryClient(); return useMutation({ mutationFn: (input: any) => http.put<any>('/notices/settings', input), onSuccess: () => inv(qc, ['notices', 'settings']) }); }

// ------------------------------------------------------------------ community feed
export const usePosts = (params: Record<string, unknown> = {}, enabled = true) => useQuery({ queryKey: ['community', 'posts', params], queryFn: () => http.getPage<any>('/community/posts', buildQueryParams(params)), placeholderData: keepPreviousData, enabled });
export const usePost = (id: string) => useQuery({ queryKey: ['community', 'post', id], queryFn: () => http.get<any>(`/community/posts/${id}`), enabled: Boolean(id) });
export const useCommunityStats = () => useQuery({ queryKey: ['community', 'stats'], queryFn: () => http.get<any>('/community/stats') });
export const useCommunitySettings = () => useQuery({ queryKey: ['community', 'settings'], queryFn: () => http.get<any>('/community/settings') });
export function useCreatePost() { const qc = useQueryClient(); return useMutation({ mutationFn: (input: any) => http.post<any>('/community/posts', input), onSuccess: () => inv(qc, ['community']) }); }
export function useDeletePost() { const qc = useQueryClient(); return useMutation({ mutationFn: (id: string) => http.delete(`/community/posts/${id}`), onSuccess: () => inv(qc, ['community']) }); }
export function useCommentPost() { const qc = useQueryClient(); return useMutation({ mutationFn: ({ id, body }: { id: string; body: string }) => http.post<any>(`/community/posts/${id}/comments`, { body }), onSuccess: () => inv(qc, ['community']) }); }
export function useRemoveComment() { const qc = useQueryClient(); return useMutation({ mutationFn: ({ id, commentId }: { id: string; commentId: string }) => http.delete<any>(`/community/posts/${id}/comments/${commentId}`), onSuccess: () => inv(qc, ['community']) }); }
export function useLikePost() { const qc = useQueryClient(); return useMutation({ mutationFn: (id: string) => http.post<{ liked: boolean; likeCount: number }>(`/community/posts/${id}/like`), onSuccess: () => inv(qc, ['community', 'posts']) }); }
export function useReportPost() { const qc = useQueryClient(); return useMutation({ mutationFn: ({ id, reason }: { id: string; reason: string }) => http.post<any>(`/community/posts/${id}/report`, { reason }), onSuccess: () => inv(qc, ['community']) }); }
export function useModeratePost() { const qc = useQueryClient(); return useMutation({ mutationFn: ({ id, action, note }: { id: string; action: string; note?: string }) => http.post<any>(`/community/posts/${id}/moderate`, { action, note }), onSuccess: () => inv(qc, ['community']) }); }
export function useSaveCommunitySettings() { const qc = useQueryClient(); return useMutation({ mutationFn: (input: any) => http.put<any>('/community/settings', input), onSuccess: () => inv(qc, ['community', 'settings']) }); }

// ------------------------------------------------------------------ events
export const useEvents = (params: Record<string, unknown> = {}, enabled = true) => useQuery({ queryKey: ['events', 'list', params], queryFn: () => http.getPage<any>('/events', buildQueryParams(params)), placeholderData: keepPreviousData, enabled });
export const useEvent = (id: string) => useQuery({ queryKey: ['events', 'detail', id], queryFn: () => http.get<any>(`/events/${id}`), enabled: Boolean(id) });
export const useEventStats = () => useQuery({ queryKey: ['events', 'stats'], queryFn: () => http.get<any>('/events/stats') });
export const useEventTypes = () => useQuery({ queryKey: ['events', 'types'], queryFn: () => http.get<any[]>('/events/types'), staleTime: 5 * 60_000 });
export const useEventAttendees = (id: string, enabled = true) => useQuery({ queryKey: ['events', 'attendees', id], queryFn: () => http.get<any>(`/events/${id}/attendees`), enabled: Boolean(id) && enabled });
export function useCreateEvent() { const qc = useQueryClient(); return useMutation({ mutationFn: (input: any) => http.post<any>('/events', input), onSuccess: () => inv(qc, ['events']) }); }
export function useUpdateEvent() { const qc = useQueryClient(); return useMutation({ mutationFn: ({ id, ...input }: any) => http.patch<any>(`/events/${id}`, input), onSuccess: () => inv(qc, ['events']) }); }
export function usePublishEvent() { const qc = useQueryClient(); return useMutation({ mutationFn: (id: string) => http.post<any>(`/events/${id}/publish`), onSuccess: () => inv(qc, ['events']) }); }
export function useCancelEvent() { const qc = useQueryClient(); return useMutation({ mutationFn: ({ id, reason }: { id: string; reason?: string }) => http.post<any>(`/events/${id}/cancel`, { reason }), onSuccess: () => inv(qc, ['events']) }); }
export function useDeleteEvent() { const qc = useQueryClient(); return useMutation({ mutationFn: (id: string) => http.delete(`/events/${id}`), onSuccess: () => inv(qc, ['events']) }); }
export function useRsvp() { const qc = useQueryClient(); return useMutation({ mutationFn: ({ id, ...input }: { id: string; status: string; guests?: number; note?: string }) => http.post<any>(`/events/${id}/rsvp`, input), onSuccess: () => inv(qc, ['events']) }); }
export function useExportAttendees() { return useMutation({ mutationFn: async (id: string) => { const { blob, filename } = await http.blob(`/events/${id}/attendees/export`); downloadFile(blob, filename ?? 'attendees.csv'); } }); }

// ------------------------------------------------------------------ polls
export const usePolls = (params: Record<string, unknown> = {}, enabled = true) => useQuery({ queryKey: ['polls', 'list', params], queryFn: () => http.getPage<any>('/polls', buildQueryParams(params)), placeholderData: keepPreviousData, enabled });
export const usePoll = (id: string) => useQuery({ queryKey: ['polls', 'detail', id], queryFn: () => http.get<any>(`/polls/${id}`), enabled: Boolean(id) });
export const usePollResults = (id: string, enabled = true) => useQuery({ queryKey: ['polls', 'results', id], queryFn: () => http.get<any>(`/polls/${id}/results`), enabled: Boolean(id) && enabled });
export function useCreatePoll() { const qc = useQueryClient(); return useMutation({ mutationFn: (input: any) => http.post<any>('/polls', input), onSuccess: () => inv(qc, ['polls']) }); }
export function useUpdatePoll() { const qc = useQueryClient(); return useMutation({ mutationFn: ({ id, ...input }: any) => http.patch<any>(`/polls/${id}`, input), onSuccess: () => inv(qc, ['polls']) }); }
export function useOpenPoll() { const qc = useQueryClient(); return useMutation({ mutationFn: ({ id, endAt }: { id: string; endAt?: string | null }) => http.post<any>(`/polls/${id}/open`, { endAt }), onSuccess: () => inv(qc, ['polls']) }); }
export function useClosePoll() { const qc = useQueryClient(); return useMutation({ mutationFn: (id: string) => http.post<any>(`/polls/${id}/close`), onSuccess: () => inv(qc, ['polls']) }); }
export function useDeletePoll() { const qc = useQueryClient(); return useMutation({ mutationFn: (id: string) => http.delete(`/polls/${id}`), onSuccess: () => inv(qc, ['polls']) }); }
export function useVote() { const qc = useQueryClient(); return useMutation({ mutationFn: ({ id, optionKeys }: { id: string; optionKeys: string[] }) => http.post<any>(`/polls/${id}/vote`, { optionKeys }), onSuccess: () => inv(qc, ['polls']) }); }

// ------------------------------------------------------------------ surveys
export const useSurveys = (params: Record<string, unknown> = {}, enabled = true) => useQuery({ queryKey: ['surveys', 'list', params], queryFn: () => http.getPage<any>('/surveys', buildQueryParams(params)), placeholderData: keepPreviousData, enabled });
export const useSurvey = (id: string) => useQuery({ queryKey: ['surveys', 'detail', id], queryFn: () => http.get<any>(`/surveys/${id}`), enabled: Boolean(id) });
export const useSurveyResults = (id: string, enabled = true) => useQuery({ queryKey: ['surveys', 'results', id], queryFn: () => http.get<any>(`/surveys/${id}/results`), enabled: Boolean(id) && enabled });
export function useCreateSurvey() { const qc = useQueryClient(); return useMutation({ mutationFn: (input: any) => http.post<any>('/surveys', input), onSuccess: () => inv(qc, ['surveys']) }); }
export function useUpdateSurvey() { const qc = useQueryClient(); return useMutation({ mutationFn: ({ id, ...input }: any) => http.patch<any>(`/surveys/${id}`, input), onSuccess: () => inv(qc, ['surveys']) }); }
export function useOpenSurvey() { const qc = useQueryClient(); return useMutation({ mutationFn: ({ id, endAt }: { id: string; endAt?: string | null }) => http.post<any>(`/surveys/${id}/open`, { endAt }), onSuccess: () => inv(qc, ['surveys']) }); }
export function useCloseSurvey() { const qc = useQueryClient(); return useMutation({ mutationFn: (id: string) => http.post<any>(`/surveys/${id}/close`), onSuccess: () => inv(qc, ['surveys']) }); }
export function useDeleteSurvey() { const qc = useQueryClient(); return useMutation({ mutationFn: (id: string) => http.delete(`/surveys/${id}`), onSuccess: () => inv(qc, ['surveys']) }); }
export function useRespondSurvey() { const qc = useQueryClient(); return useMutation({ mutationFn: ({ id, answers }: { id: string; answers: { questionKey: string; value: unknown }[] }) => http.post<any>(`/surveys/${id}/respond`, { answers }), onSuccess: () => inv(qc, ['surveys']) }); }
export function useExportSurvey() { return useMutation({ mutationFn: async (id: string) => { const { blob, filename } = await http.blob(`/surveys/${id}/export`); downloadFile(blob, filename ?? 'survey-responses.csv'); } }); }
