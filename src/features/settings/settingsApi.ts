import { apiSlice } from '../../api/apiSlice';

export interface SettingsProfile {
  name: string;
  email: string;
  language: string;
  timezone: string;
}

export interface SettingsState {
  profile: SettingsProfile;
  currency: string;
  taxRate: number;
  invoicePrefix: string;
  paymentTerms: string;
}

export interface SettingsResponse extends SettingsState {
  databaseFile?: string;
}

export interface UpdateSettingsRequest extends SettingsState {}

const FALLBACK_SETTINGS: SettingsResponse = {
  profile: {
    name: 'Alex Rivers',
    email: 'alex@riversdesign.com',
    language: 'English',
    timezone: 'UTC-05:00 Eastern Time',
  },
  currency: 'USD ($)',
  taxRate: 20,
  invoicePrefix: 'INV-',
  paymentTerms: 'Net 15',
  databaseFile: 'freelanceflow.db',
};

export const settingsApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getSettings: builder.query<SettingsResponse, void>({
      query: () => '/settings',
    }),
    updateSettings: builder.mutation<SettingsResponse, UpdateSettingsRequest>({
      query: (body) => ({
        url: '/settings',
        method: 'PUT',
        body,
      }),
    }),
  }),
});

export const { useGetSettingsQuery, useUpdateSettingsMutation } = settingsApi;

export { FALLBACK_SETTINGS };