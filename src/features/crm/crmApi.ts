import { apiSlice, type CreateLeadPayload, type DeleteLeadPayload, type GetLeadsArgs, type Lead, type LeadListResult, type UpdateLeadPayload, type UpdateLeadStagePayload, normalizeGetLeadsArgs, upsertLeadIntoDraft } from '../../api/apiSlice';

export const crmApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getLeads: builder.query<LeadListResult, GetLeadsArgs | void>({
      query: (args) => {
        const normalizedArgs = normalizeGetLeadsArgs(args);

        return {
          url: '/leads',
          params: normalizedArgs,
        };
      },
      providesTags: (result) =>
        result
          ? [
              { type: 'Lead' as const, id: 'LIST' },
              ...result.items.map((lead) => ({ type: 'Lead' as const, id: lead.id })),
            ]
          : [{ type: 'Lead' as const, id: 'LIST' }],
    }),
    createLead: builder.mutation<Lead, CreateLeadPayload>({
      query: (body) => ({
        url: '/leads',
        method: 'POST',
        body,
      }),
      invalidatesTags: [{ type: 'Lead', id: 'LIST' }],
    }),
    updateLeadStage: builder.mutation<Lead, UpdateLeadStagePayload>({
      query: ({ id, ...body }) => ({
        url: `/leads/${id}/stage`,
        method: 'PATCH',
        body,
      }),
      invalidatesTags: (_result, _error, { id }) => [{ type: 'Lead', id }, { type: 'Lead', id: 'LIST' }],
      async onQueryStarted({ id, stage, position }, { dispatch, getState, queryFulfilled }) {
        const cacheEntries = crmApi.util.selectInvalidatedBy(getState() as any, [{ type: 'Lead' as const, id: 'LIST' }]);
        const patches = cacheEntries
          .filter((entry) => entry.endpointName === 'getLeads')
          .map((entry) => {
            const normalizedArgs = normalizeGetLeadsArgs(entry.originalArgs as GetLeadsArgs | undefined);

            return dispatch(
              crmApi.util.updateQueryData('getLeads', entry.originalArgs as GetLeadsArgs | void, (draft) => {
                const leadIndex = draft.items.findIndex((lead) => lead.id === id);

                if (leadIndex >= 0) {
                  upsertLeadIntoDraft(
                    draft,
                    {
                      ...draft.items[leadIndex],
                      stage,
                      position,
                    },
                    normalizedArgs.stage,
                  );
                }
              }),
            );
          });

        try {
          await queryFulfilled;
        } catch {
          patches.reverse().forEach((patch) => patch.undo());
        }
      },
    }),
    updateLead: builder.mutation<Lead, { id: number; body: UpdateLeadPayload }>({
      query: ({ id, body }) => ({
        url: `/leads/${id}`,
        method: 'PUT',
        body,
      }),
      invalidatesTags: (_result, _error, { id }) => [{ type: 'Lead', id }, { type: 'Lead', id: 'LIST' }],
    }),
    deleteLead: builder.mutation<{ success: true }, DeleteLeadPayload>({
      query: ({ id }) => ({
        url: `/leads/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: (_result, _error, { id }) => [{ type: 'Lead', id }, { type: 'Lead', id: 'LIST' }],
    }),
  }),
});

export const {
  useGetLeadsQuery,
  useCreateLeadMutation,
  useUpdateLeadStageMutation,
  useUpdateLeadMutation,
  useDeleteLeadMutation,
} = crmApi;