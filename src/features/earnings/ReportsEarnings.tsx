import { useMemo, useState, type ReactNode } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  FALLBACK_INCOME_VS_EXPENSES,
  FALLBACK_PERFORMANCE_BREAKDOWN,
  FALLBACK_SUMMARY,
  useGetEarningsSummaryQuery,
  useGetIncomeVsExpensesQuery,
  useGetPerformanceBreakdownQuery,
  type EarningsDateRange,
  type EarningsSummaryCard,
} from './earningsApi';

const DATE_RANGE_OPTIONS: Array<{ label: string; value: EarningsDateRange }> = [
  { label: 'This Month', value: 'this_month' },
  { label: 'Last Month', value: 'last_month' },
  { label: 'Last 6 Months', value: 'last_6_months' },
  { label: 'Custom', value: 'custom' },
];

const BAR_COLORS = ['#2563eb', '#94a3b8'];

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

function SummaryIcon({ label }: { label: string }) {
  const common = 'h-4 w-4';

  if (label === 'Billable Hours') {
    return (
      <svg viewBox="0 0 24 24" className={common} aria-hidden="true">
        <path
          d="M12 7v5l3 2M20 12a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.8"
        />
      </svg>
    );
  }

  if (label === 'Outstanding Invoices') {
    return (
      <svg viewBox="0 0 24 24" className={common} aria-hidden="true">
        <path
          d="M6 4h12v16H6zM9 8h6M9 12h6M9 16h4"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.8"
        />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" className={common} aria-hidden="true">
      <path
        d="M5 15l4-4 3 3 7-7M16 7h3v3"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function TrendBadge({ trend }: { trend: EarningsSummaryCard['trend'] }) {
  const palette =
    trend.tone === 'negative'
      ? 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200'
      : trend.tone === 'neutral'
        ? 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
        : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200';

  const arrow = trend.direction === 'down' ? '↘' : trend.direction === 'flat' ? '→' : '↗';

  return (
    <div className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${palette}`}>
      <span>{arrow}</span>
      <span>{trend.value}</span>
    </div>
  );
}

function SummaryCard({ card }: { card: EarningsSummaryCard }) {
  return (
    <article className="rounded-[1.35rem] border border-slate-200 bg-white p-5 shadow-[0_12px_24px_-18px_rgba(15,23,42,0.35)] dark:border-slate-800 dark:bg-slate-950/80">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[0.72rem] font-medium uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
            {card.label}
          </div>
          <div className="mt-3 text-[2rem] font-semibold tracking-tight text-slate-950 dark:text-slate-50">
            {card.formattedValue}
          </div>
        </div>

        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-300">
          <SummaryIcon label={card.label} />
        </div>
      </div>

      <div className="mt-4">
        <TrendBadge trend={card.trend} />
      </div>
    </article>
  );
}

function SectionCard({
  title,
  children,
  action,
  className = '',
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-[1.35rem] border border-slate-200 bg-white/95 shadow-[0_12px_24px_-18px_rgba(15,23,42,0.35)] backdrop-blur dark:border-slate-800 dark:bg-slate-950/80 ${className}`}
    >
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
        <h2 className="text-[1.04rem] font-semibold tracking-tight text-slate-900 dark:text-slate-100">
          {title}
        </h2>
        {action}
      </div>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

function SidebarIcon({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" className="h-4.5 w-4.5 shrink-0" aria-hidden="true">
      {children}
    </svg>
  );
}

function SidebarItem({ label, active = false, icon }: { label: string; active?: boolean; icon: ReactNode }) {
  return (
    <button
      type="button"
      className={[
        'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition',
        active
          ? 'bg-sky-100 text-slate-950 shadow-sm dark:bg-slate-800 dark:text-slate-50'
          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-800/70 dark:hover:text-slate-50',
      ].join(' ')}
    >
      <SidebarIcon>{icon}</SidebarIcon>
      <span>{label}</span>
    </button>
  );
}

function formatChartTooltipValue(value: number) {
  return formatCurrency(value);
}

export default function ReportsEarnings() {
  const [dateRange, setDateRange] = useState<EarningsDateRange>('this_month');

  const queryArgs = useMemo(() => ({ range: dateRange }), [dateRange]);

  const { data: summaryData } = useGetEarningsSummaryQuery(queryArgs);
  const { data: incomeVsExpensesData } = useGetIncomeVsExpensesQuery(queryArgs);
  const { data: performanceBreakdownData } = useGetPerformanceBreakdownQuery(queryArgs);

  const summary = summaryData ?? FALLBACK_SUMMARY;
  const incomeVsExpenses = incomeVsExpensesData ?? FALLBACK_INCOME_VS_EXPENSES;
  const performanceBreakdown = performanceBreakdownData ?? FALLBACK_PERFORMANCE_BREAKDOWN;

  const chartData = useMemo(
    () =>
      incomeVsExpenses.map((entry) => ({
        ...entry,
        incomeDisplay: entry.income,
        expensesDisplay: entry.expenses,
      })),
    [incomeVsExpenses],
  );

  const summaryCards = [summary.billableHours, summary.outstandingInvoices, summary.netProfit];

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(37,99,235,0.08),transparent_28%),radial-gradient(circle_at_top_right,rgba(14,165,233,0.09),transparent_22%),linear-gradient(to_bottom,#f8fbff,#f4f7fb)] text-slate-900 dark:bg-[radial-gradient(circle_at_top_left,rgba(37,99,235,0.12),transparent_26%),radial-gradient(circle_at_top_right,rgba(15,23,42,0.6),transparent_30%),linear-gradient(to_bottom,#090b12,#0f131b)] dark:text-slate-100">
      <div className="mx-auto grid min-h-screen max-w-[1600px] grid-cols-1 xl:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="hidden border-r border-slate-200 bg-white/85 px-4 py-4 shadow-[inset_-1px_0_0_rgba(148,163,184,0.2)] backdrop-blur dark:border-slate-800 dark:bg-slate-950/85 xl:flex xl:flex-col">
          <div className="flex items-center gap-3 rounded-2xl px-2 py-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-600 text-lg font-semibold text-white shadow-lg shadow-sky-500/25 dark:bg-sky-500">
              FF
            </div>
            <div>
              <div className="text-[1.02rem] font-semibold tracking-tight text-slate-950 dark:text-slate-100">
                FreelanceFlow
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400">Managing Operations</div>
            </div>
          </div>

          <div className="mt-4 rounded-2xl bg-slate-950 px-4 py-4 text-slate-100 shadow-lg dark:bg-slate-900/60">
            <div className="text-sm font-medium text-slate-300">Start Session</div>
            <p className="mt-1 text-xs leading-5 text-slate-400">
              Keep reports and time tracking connected from one workspace.
            </p>
            <button
              type="button"
              className="mt-4 inline-flex items-center justify-center rounded-xl bg-sky-300 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-sky-200"
            >
              ▶ Start Session
            </button>
          </div>

          <nav className="mt-5 space-y-1">
            {[
              ['Dashboard', false],
              ['CRM Pipeline', false],
              ['Invoices', false],
              ['Time Tracking', false],
              ['Earnings', true],
              ['Settings', false],
            ].map(([label, active]) => (
              <SidebarItem
                key={String(label)}
                label={String(label)}
                active={Boolean(active)}
                icon={
                  label === 'Dashboard' ? (
                    <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" fill="currentColor" />
                  ) : label === 'CRM Pipeline' ? (
                    <path d="M4 6h6v4H4zM14 6h6v4h-6zM4 14h6v4H4zM14 14h6v4h-6zM10 8h4v8h-4z" fill="currentColor" />
                  ) : label === 'Invoices' ? (
                    <path
                      d="M5 4h14v16H5zM8 8h8M8 12h8M8 16h5"
                      fill="none"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="1.6"
                    />
                  ) : label === 'Time Tracking' ? (
                    <path
                      d="M12 7v5l3 2M20 12a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z"
                      fill="none"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="1.6"
                    />
                  ) : label === 'Earnings' ? (
                    <path
                      d="M4 12h16M6 8h2m8 8h2M6 4h12v16H6z"
                      fill="none"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="1.6"
                    />
                  ) : (
                    <path
                      d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Zm8 3.5-1.7.9a6.9 6.9 0 0 1-.6 1.4l.5 1.8-1.7 1.7-1.8-.5a6.9 6.9 0 0 1-1.4.6L12 20l-1.3-1.6a6.9 6.9 0 0 1-1.4-.6l-1.8.5-1.7-1.7.5-1.8a6.9 6.9 0 0 1-.6-1.4L4 12l1.7-.9a6.9 6.9 0 0 1 .6-1.4L5.8 7.9l1.7-1.7 1.8.5a6.9 6.9 0 0 1 1.4-.6L12 4l1.3 1.6a6.9 6.9 0 0 1 1.4.6l1.8-.5 1.7 1.7-.5 1.8c.2.5.5.9.6 1.4Z"
                      fill="none"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="1.4"
                    />
                  )
                }
              />
            ))}
          </nav>

          <div className="mt-auto space-y-2 border-t border-slate-200 pt-4 dark:border-slate-800">
            <button
              type="button"
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-slate-600 transition hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-800/70 dark:hover:text-slate-50"
            >
              Help Center
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-slate-600 transition hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-800/70 dark:hover:text-slate-50"
            >
              Logout
            </button>
          </div>
        </aside>

        <main className="min-w-0 px-4 py-4 sm:px-6 lg:px-8 xl:px-10">
          <header className="flex flex-col gap-4 border-b border-slate-200 pb-4 dark:border-slate-800 xl:flex-row xl:items-center xl:justify-between">
            <div className="space-y-1">
              <div className="text-3xl font-semibold tracking-tight text-slate-950 dark:text-slate-50 sm:text-[2.15rem]">
                Reports &amp; Earnings
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <label className="relative">
                <span className="sr-only">Select date range</span>
                <select
                  value={dateRange}
                  onChange={(event) => setDateRange(event.target.value as EarningsDateRange)}
                  className="min-w-40 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 outline-none transition focus:border-sky-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                >
                  {DATE_RANGE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <button
                type="button"
                className="inline-flex h-10 items-center gap-2 rounded-full bg-sky-600 px-4 text-sm font-semibold text-white shadow-lg shadow-sky-500/20 transition hover:bg-sky-500"
              >
                <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" aria-hidden="true">
                  <path
                    d="M7 4h7l4 4v12H7zM14 4v4h4M9 13h6M9 16h4"
                    fill="none"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.8"
                  />
                </svg>
                Export PDF
              </button>
            </div>
          </header>

          <div className="mt-6 grid gap-4 xl:grid-cols-3">
            {summaryCards.map((card) => (
              <SummaryCard key={card.label} card={card} />
            ))}
          </div>

          <div className="mt-5 grid gap-5">
            <SectionCard
              title="Monthly Income vs Expenses"
              action={
                <div className="flex items-center gap-4 text-xs font-medium text-slate-500 dark:text-slate-400">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-sm bg-blue-600" /> Income
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-sm bg-slate-300 dark:bg-slate-500" /> Expenses
                  </span>
                </div>
              }
              className="min-h-82.5"
            >
              <div className="h-62.5">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 10, right: 8, left: -14, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="4 8" vertical={false} stroke="rgba(148,163,184,0.16)" />
                    <XAxis dataKey="month" tickLine={false} axisLine={false} stroke="currentColor" />
                    <YAxis tickLine={false} axisLine={false} width={40} stroke="currentColor" />
                    <Tooltip
                      contentStyle={{
                        background: 'rgba(15, 23, 42, 0.96)',
                        border: '1px solid rgba(148, 163, 184, 0.22)',
                        borderRadius: 16,
                        color: '#f8fafc',
                        boxShadow: '0 20px 40px -24px rgba(15, 23, 42, 0.9)',
                      }}
                      labelStyle={{ color: '#cbd5e1', fontWeight: 600 }}
                      formatter={(value: number, name: string) => [formatChartTooltipValue(value), name]}
                    />
                    <Bar dataKey="incomeDisplay" name="Income" radius={[6, 6, 0, 0]} fill={BAR_COLORS[0]}>
                      {chartData.map((entry) => (
                        <Cell key={`income-${entry.month}`} fill={BAR_COLORS[0]} />
                      ))}
                    </Bar>
                    <Bar dataKey="expensesDisplay" name="Expenses" radius={[6, 6, 0, 0]} fill={BAR_COLORS[1]}>
                      {chartData.map((entry) => (
                        <Cell key={`expenses-${entry.month}`} fill={BAR_COLORS[1]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </SectionCard>

            <SectionCard
              title="Performance Breakdown"
              action={<span className="text-sm font-medium text-sky-600 dark:text-sky-400">View All</span>}
            >
              <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800">
                <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800">
                  <thead className="bg-slate-50 dark:bg-slate-900/70">
                    <tr className="text-left text-[11px] uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                      <th className="px-4 py-3 font-semibold">Month</th>
                      <th className="px-4 py-3 font-semibold">Projects</th>
                      <th className="px-4 py-3 font-semibold">Gross Income</th>
                      <th className="px-4 py-3 font-semibold">Expenses</th>
                      <th className="px-4 py-3 font-semibold">Net Profit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-800 dark:bg-slate-950">
                    {performanceBreakdown.map((row) => (
                      <tr key={row.month} className="text-sm text-slate-700 dark:text-slate-200">
                        <td className="px-4 py-4 font-medium text-slate-900 dark:text-slate-100">{row.month}</td>
                        <td className="px-4 py-4">{row.projects}</td>
                        <td className="px-4 py-4">{formatCurrency(row.grossIncome)}</td>
                        <td className="px-4 py-4">{formatCurrency(row.expenses)}</td>
                        <td className="px-4 py-4 font-semibold text-sky-600 dark:text-sky-400">
                          {formatCurrency(row.netProfit)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          </div>
        </main>
      </div>
    </div>
  );
}