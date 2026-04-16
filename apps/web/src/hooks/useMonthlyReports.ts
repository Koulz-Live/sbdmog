// apps/web/src/hooks/useMonthlyReports.ts
// React Query hooks for Monthly Report detail, approve, publish, and AI draft.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPatch, apiPost } from '../services/api.js';
import type { MonthlyReport } from '@heqcis/types';

interface DetailResponse { data: MonthlyReport; }

interface AiDraftResponse {
  data: { output: string; model: string; generated_at: string };
}

export function useMonthlyReport(id: string) {
  return useQuery({
    queryKey: ['monthlyReport', id],
    queryFn:  () => apiGet<DetailResponse>(`/monthly-reports/${id}`),
    enabled:  !!id,
  });
}

export function useUpdateMonthlyReport(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<MonthlyReport>) =>
      apiPatch(`/monthly-reports/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['monthlyReport', id] });
      qc.invalidateQueries({ queryKey: ['monthlyReports'] });
    },
  });
}

export function useApproveMonthlyReport(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiPost(`/monthly-reports/${id}/approve`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['monthlyReport', id] });
      qc.invalidateQueries({ queryKey: ['monthlyReports'] });
    },
  });
}

export function usePublishMonthlyReport(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiPost(`/monthly-reports/${id}/publish`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['monthlyReport', id] });
      qc.invalidateQueries({ queryKey: ['monthlyReports'] });
    },
  });
}

export function useGenerateMonthlyReportDraft(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiPost<AiDraftResponse>(`/monthly-reports/${id}/ai/draft`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['monthlyReport', id] });
    },
  });
}
