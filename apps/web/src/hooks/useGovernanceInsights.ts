// apps/web/src/hooks/useGovernanceInsights.ts
// React Query mutation hook for generating governance insights.

import { useMutation } from '@tanstack/react-query';
import { apiPost } from '../services/api.js';

interface GovernanceInsightsResponse {
  data: {
    output:       string;
    model:        string;
    tokens:       { prompt: number; completion: number };
    generated_at: string;
  };
}

export function useGovernanceInsights() {
  return useMutation({
    mutationFn: () => apiPost<GovernanceInsightsResponse>('/governance-insights'),
  });
}
