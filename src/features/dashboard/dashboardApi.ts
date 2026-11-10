import { apiSlice } from '../../api/apiSlice';

export type DashboardTrendDirection = 'up' | 'down' | 'flat';

export interface DashboardTrend {
  direction: DashboardTrendDirection;
  value: string;
  tone?: 'positive' | 'negative' | 'neutral';
}

export interface DashboardSummaryCard {
  label: string;
  value: number;
  formattedValue?: string;
  trend: DashboardTrend;
  icon?: 'clock' | 'quote' | 'profit';
}

export interface DashboardActiveSession {
  isRunning: boolean;
  projectName: string;
  startedAt: string;
  durationSeconds: number;
  dailyTotal: number;
}

export interface DashboardChartPoint {
  label: string;
  income: number;
  expenses: number;
}

export interface DashboardPipelineStage {
  label: string;
  count: number;
}

export interface DashboardInvoice {
  id: number;
  client: string;
  amount: number;
  date: string;
  status: 'Pending' | 'Overdue' | 'Paid';
}

export interface DashboardFileItem {
  id: number;
  name: string;
  meta: string;
  size: string;
  icon: 'pdf' | 'zip' | 'doc' | 'file';
}

export interface DashboardSummary {
  userName: string;
  greeting: string;
  summaryCards: DashboardSummaryCard[];
  activeSession: DashboardActiveSession;
  incomeVsExpenses: DashboardChartPoint[];
  dealPipeline: DashboardPipelineStage[];
  recentInvoices: DashboardInvoice[];
  recentFiles: DashboardFileItem[];
}

const FALLBACK_DASHBOARD_SUMMARY: DashboardSummary = {
  userName: 'Alex Rivers',
  greeting: 'Welcome back',
  summaryCards: [
    {
      label: 'Billable Hours Today',
      value: 6.5,
      formattedValue: '6.5h',
      trend: { direction: 'up', value: '+1.2h', tone: 'positive' },
      icon: 'clock',
    },
    {
      label: 'Pending Quotes',
      value: 4,
      formattedValue: '4',
      trend: { direction: 'flat', value: 'No change', tone: 'neutral' },
      icon: 'quote',
    },
    {
      label: 'Net Profit This Month',
      value: 4200,
      formattedValue: '$4,200',
      trend: { direction: 'up', value: '+8.5%', tone: 'positive' },
      icon: 'profit',
    },
  ],
  activeSession: {
    isRunning: true,
    projectName: 'Project Nexus',
    startedAt: new Date(Date.now() - 8085000).toISOString(),
    durationSeconds: 8085,
    dailyTotal: 240,
  },
  incomeVsExpenses: [
    { label: 'Jan', income: 5400, expenses: 2100 },
    { label: 'Feb', income: 6200, expenses: 2500 },
    { label: 'Mar', income: 7100, expenses: 2800 },
    { label: 'Apr', income: 7600, expenses: 2600 },
    { label: 'May', income: 8200, expenses: 3000 },
    { label: 'Jun', income: 9100, expenses: 3400 },
  ],
  dealPipeline: [
    { label: 'New Leads', count: 3 },
    { label: 'Proposal Sent', count: 1 },
    { label: 'Won', count: 8 },
  ],
  recentInvoices: [
    { id: 1024, client: 'Acme Corp', amount: 1250, date: 'Oct 15, 2023', status: 'Pending' },
    { id: 1025, client: 'Globex Inc', amount: 800, date: 'Oct 12, 2023', status: 'Overdue' },
  ],
  recentFiles: [
    { id: 1, name: 'TechNova_Contract_v2.pdf', meta: '2.4 MB • Today, 10:45 AM', size: '2.4 MB', icon: 'pdf' },
    { id: 2, name: 'Hero_Assets_Final.zip', meta: '45.8 MB • Yesterday', size: '45.8 MB', icon: 'zip' },
    { id: 3, name: 'Q3_Invoice_Template.docx', meta: '124 KB • Oct 10', size: '124 KB', icon: 'doc' },
  ],
};

export const dashboardApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getDashboardSummary: builder.query<DashboardSummary, void>({
      query: () => '/dashboard/summary',
    }),
  }),
});

export const { useGetDashboardSummaryQuery } = dashboardApi;

export { FALLBACK_DASHBOARD_SUMMARY };