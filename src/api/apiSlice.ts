import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';

declare global {
  interface Window {
    __APP_PORT__: number | string;
    __APP_TOKEN__: string;
  }
}

export const apiSlice = createApi({
  reducerPath: 'api',
  baseQuery: fetchBaseQuery({
    baseUrl: `http://127.0.0.1:${window.__APP_PORT__}/api`,
    prepareHeaders: (headers) => {
      headers.set('Authorization', `Bearer ${window.__APP_TOKEN__}`);
      return headers;
    },
  }),
  tagTypes: ['Lead', 'TimeEntry'],
  endpoints: () => ({}),
});

export type LeadStage = 'new_leads' | 'contacted' | 'proposal_sent' | 'won' | 'lost';

export interface Lead {
  id: number;
  client_name: string;
  email: string | null;
  project_type: string | null;
  value: number;
  stage: LeadStage;
  notes: string | null;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface LeadListResult {
  items: Lead[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface GetLeadsArgs {
  page?: number;
  limit?: number;
  stage?: LeadStage;
}

export interface CreateLeadPayload {
  client_name: string;
  email?: string | null;
  project_type?: string | null;
  value?: number;
  stage?: LeadStage;
  notes?: string | null;
  position?: number;
}

export interface UpdateLeadPayload {
  client_name: string;
  email: string | null;
  project_type: string | null;
  value: number;
  stage: LeadStage;
  notes: string | null;
  position: number;
}

export interface UpdateLeadStagePayload {
  id: number;
  stage: LeadStage;
  position: number;
}

export interface DeleteLeadPayload {
  id: number;
}

export type { Lead as CrmLead, LeadListResult as CrmLeadListResult };

export const leadSortComparator = (firstLead: Lead, secondLead: Lead) => {
  if (firstLead.position !== secondLead.position) {
    return firstLead.position - secondLead.position;
  }

  if (firstLead.updated_at !== secondLead.updated_at) {
    return firstLead.updated_at > secondLead.updated_at ? -1 : 1;
  }

  return secondLead.id - firstLead.id;
};

export function normalizeGetLeadsArgs(args?: GetLeadsArgs | void): GetLeadsArgs {
  return {
    page: args?.page ?? 1,
    limit: args?.limit ?? 20,
    stage: args?.stage,
  };
}

export function upsertLeadIntoDraft(
  draft: LeadListResult,
  lead: Lead,
  stageFilter?: LeadStage,
): void {
  const existingIndex = draft.items.findIndex((item) => item.id === lead.id);
  const shouldContainLead = !stageFilter || stageFilter === lead.stage;

  if (!shouldContainLead) {
    if (existingIndex >= 0) {
      draft.items.splice(existingIndex, 1);
    }

    return;
  }

  if (existingIndex >= 0) {
    draft.items[existingIndex] = lead;
  } else {
    draft.items.push(lead);
  }

  draft.items.sort(leadSortComparator);
}

export {};