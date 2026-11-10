import { apiSlice } from '../../api/apiSlice';

export type EarningsDateRange = 'this_month' | 'last_month' | 'last_6_months' | 'custom';

export interface EarningsQueryArgs {
  range: EarningsDateRange;
}

export interface EarningsSummaryCard {
  label: string;
  value: number;
  formattedValue: string;
  trend: {
    direction: 'up' | 'down' | 'flat';
    value: string;
    tone: 'positive' | 'negative' | 'neutral';
  };
}

export interface EarningsSummary {
  billableHours: EarningsSummaryCard;
  outstandingInvoices: EarningsSummaryCard;
  netProfit: EarningsSummaryCard;
}

export interface IncomeVsExpensesPoint {
  month: string;
  income: number;
  expenses: number;
}

export interface PerformanceBreakdownRow {
  month: string;
  projects: number;
  grossIncome: number;
  expenses: number;
  netProfit: number;
}

const FALLBACK_SUMMARY: EarningsSummary = {
  billableHours: {
    label: 'Billable Hours',
    value: 142.5,
    formattedValue: '142.5hrs',
    trend: { direction: 'up', value: '+12% from last month', tone: 'positive' },
  },
  outstandingInvoices: {
    label: 'Outstanding Invoices',
    value: 4250,
    formattedValue: '$4,250.00',
    trend: { direction: 'down', value: '3 overdue invoices', tone: 'negative' },
  },
  netProfit: {
    label: 'Net Profit',
    value: 8920.5,
    formattedValue: '$8,920.50',
    trend: { direction: 'up', value: '+5.4% from last month', tone: 'positive' },
  },
};

const FALLBACK_INCOME_VS_EXPENSES: IncomeVsExpensesPoint[] = [
  { month: 'Jan', income: 4800, expenses: 1200 },
  { month: 'Feb', income: 6200, expenses: 2100 },
  { month: 'Mar', income: 3900, expenses: 1600 },
  { month: 'Apr', income: 7600, expenses: 2900 },
  { month: 'May', income: 7100, expenses: 2400 },
  { month: 'Jun', income: 8400, expenses: 3300 },
];

const FALLBACK_PERFORMANCE_BREAKDOWN: PerformanceBreakdownRow[] = [
  { month: 'May 2024', projects: 12, grossIncome: 18500, expenses: 6100, netProfit: 12400 },
  { month: 'Apr 2024', projects: 9, grossIncome: 15200, expenses: 6200, netProfit: 9000 },
  { month: 'Mar 2024', projects: 10, grossIncome: 16400, expenses: 5800, netProfit: 10600 },
  { month: 'Feb 2024', projects: 8, grossIncome: 13800, expenses: 5400, netProfit: 8400 },
  { month: 'Jan 2024', projects: 7, grossIncome: 12100, expenses: 4700, netProfit: 7400 },
];

export const earningsApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getEarningsSummary: builder.query<EarningsSummary, EarningsQueryArgs>({
      query: ({ range }) => ({
        url: '/earnings/summary',
        params: { range },
      }),
    }),
    getIncomeVsExpenses: builder.query<IncomeVsExpensesPoint[], EarningsQueryArgs>({
      query: ({ range }) => ({
        url: '/earnings/income-vs-expenses',
        params: { range },
      }),
    }),
    getPerformanceBreakdown: builder.query<PerformanceBreakdownRow[], EarningsQueryArgs>({
      query: ({ range }) => ({
        url: '/earnings/performance-breakdown',
        params: { range },
      }),
    }),
  }),
});

export const {
  useGetEarningsSummaryQuery,
  useGetIncomeVsExpensesQuery,
  useGetPerformanceBreakdownQuery,
} = earningsApi;

export { FALLBACK_SUMMARY, FALLBACK_INCOME_VS_EXPENSES, FALLBACK_PERFORMANCE_BREAKDOWN };