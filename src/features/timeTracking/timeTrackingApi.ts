import { apiSlice } from '../../api/apiSlice';

export interface TimeEntrySummary {
  today: {
    amount: number;
    duration: string;
  };
  thisWeek: {
    amount: number;
    duration: string;
  };
  thisMonth: {
    amount: number;
    duration: string;
  };
  uninvoiced?: {
    amount: number;
    label?: string;
  };
  projectTotal?: {
    amount: number;
    label?: string;
  };
  billableRatio?: number;
  billableBreakdown?: {
    billable: number;
    nonBillable: number;
  };
  hoursByProject?: Array<{
    projectName: string;
    hours: number;
  }>;
  recentEntries?: Array<{
    id: number;
    date: string;
    projectName: string;
    description: string;
    duration: string;
    amount: number | null;
    billable: boolean;
    status?: string;
  }>;
}

export interface StartTimeEntryPayload {
  projectId: number;
  description?: string;
  billable?: boolean;
  startedAt?: string;
}

export interface StartTimeEntryResponse {
  id: number;
  projectId: number;
  startedAt: string;
  hourlyRate: number;
  billable: boolean;
}

export interface StopTimeEntryPayload {
  id: number;
  stoppedAt?: string;
}

export interface StopTimeEntryResponse {
  id: number;
  projectId: number;
  durationSeconds: number;
  amount: number;
  stoppedAt: string;
}

export const timeTrackingApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getTimeEntriesSummary: builder.query<TimeEntrySummary, void>({
      query: () => '/time-entries/summary',
      providesTags: [{ type: 'TimeEntry', id: 'SUMMARY' }],
    }),
    startTimeEntry: builder.mutation<StartTimeEntryResponse, StartTimeEntryPayload>({
      query: (body) => ({
        url: '/time-entries/start',
        method: 'POST',
        body,
      }),
      invalidatesTags: [{ type: 'TimeEntry', id: 'SUMMARY' }],
    }),
    stopTimeEntry: builder.mutation<StopTimeEntryResponse, StopTimeEntryPayload>({
      query: (body) => ({
        url: '/time-entries/stop',
        method: 'POST',
        body,
      }),
      invalidatesTags: [{ type: 'TimeEntry', id: 'SUMMARY' }],
    }),
  }),
});

export const {
  useGetTimeEntriesSummaryQuery,
  useStartTimeEntryMutation,
  useStopTimeEntryMutation,
} = timeTrackingApi;