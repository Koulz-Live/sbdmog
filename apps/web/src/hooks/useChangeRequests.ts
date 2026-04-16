// apps/web/src/hooks/useChangeRequests.ts
// React Query hooks for Change Request detail, approval, and AI risk assessment.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost } from '../services/api.js';
import type { ChangeRequest } from '@heqcis/types';

interface Approval {
  id: string;
  change_request_id: string;
  approver_id: string;
  decision: 'approved' | 'rejected';
  comments: string | null;
  decided_at: string;
}

interface ChangeRequestDetail extends ChangeRequest {
  change_request_approvals: Approval[];
}

interface DetailResponse { data: ChangeRequestDetail; }

interface AiRiskResponse {
  data: { output: string; model: string; generated_at: string };
}

export function useChangeRequest(id: string) {
  return useQuery({
    queryKey: ['changeRequest', id],
    queryFn:  () => apiGet<DetailResponse>(`/change-requests/${id}`),
    enabled:  !!id,
  });
}

export function useApproveChangeRequest(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { decision: 'approved' | 'rejected'; comments?: string }) =>
      apiPost(`/change-requests/${id}/approve`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['changeRequest', id] });
      qc.invalidateQueries({ queryKey: ['changeRequests'] });
    },
  });
}

export function useGenerateCrAiRisk(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiPost<AiRiskResponse>(`/change-requests/${id}/ai/risk`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['changeRequest', id] });
    },
  });
}
