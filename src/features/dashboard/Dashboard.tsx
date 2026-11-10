import { useEffect, useMemo, useState } from 'react';
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
  FALLBACK_DASHBOARD_SUMMARY,
  useGetDashboardSummaryQuery,
  type DashboardSummary,
} from './dashboardApi';

type NavItem = {
  label: string;
  active?: boolean;
  icon: JSX.Element;
};

const NAV_ITEMS: NavItem[] = [
  {
    label: 'Dashboard',
    active: true,
    icon: (
      <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" fill="currentColor" />
    ),
  },
  {
    label: 'CRM Pipeline',
    icon: (
      <path
        d="M4 6h6v4H4zM14 6h6v4h-6zM4 14h6v4H4zM14 14h6v4h-6zM10 8h4v8h-4z"
        fill="currentColor"
      />
    ),
  },
  {
    label: 'Invoices',
    icon: (
      <path
        d="M5 4h14v16H5zM8 8h8M8 12h8M8 16h5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
    ),
  },
  {
    label: 'Time Tracking',
    icon: (
      <path
        d="M12 7v5l3 2M20 12a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
    ),
  },
  {
    label: 'Earnings',
    icon: (
      <path
        d="M4 12h16M6 8h2m8 8h2M6 4h12v16H6z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
    ),
  },
  {
    label: 'Settings',
    icon: (
      <path
        d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Zm8 3.5-1.7.9a6.9 6.9 0 0 1-.6 1.4l.5 1.8-1.7 1.7-1.8-.5a6.9 6.9 0 0 1-1.4.6L12 20l-1.3-1.6a6.9 6.9 0 0 1-1.4-.6l-1.8.5-1.7-1.7.5-1.8a6.9 6.9 0 0 1-.6-1.4L4 12l1.7-.9a6.9 6.9 0 0 1 .6-1.4L5.8 7.9l1.7-1.7 1.8.5a6.9 6.9 0 0 1 1.4-.6L12 4l1.3 1.6a6.9 6.9 0 0 1 1.4.6l1.8-.5 1.7 1.7-.5 1.8c.2.5.5.9.6 1.4Z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.4"
      />
    ),
  },
];

const PIPELINE_COLORS = ['#2563eb', '#f59e0b', '#16a34a'];

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

function formatHours(value: number) {
  return `${value.toFixed(1)}h`;
}

function formatTimer(seconds: number) {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const hours = String(Math.floor(safeSeconds / 3600)).padStart(2, '0');
  const minutes = String(Math.floor((safeSeconds % 3600) / 60)).padStart(2, '0');
  const remainingSeconds = String(safeSeconds % 60).padStart(2, '0');

  return `${hours}:${minutes}:${remainingSeconds}`;
}

function useLiveTimer(summary: DashboardSummary) {
  const [elapsedSeconds, setElapsedSeconds] = useState(summary.activeSession.durationSeconds);

  useEffect(() => {
    setElapsedSeconds(summary.activeSession.durationSeconds);

    if (!summary.activeSession.isRunning) {
      return undefined;
    }

    const interval = window.setInterval(() => {
      const startedAt = new Date(summary.activeSession.startedAt).getTime();
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    }, 1000);

    return () => window.clearInterval(interval);
  }, [summary.activeSession.durationSeconds, summary.activeSession.isRunning, summary.activeSession.startedAt]);

  return elapsedSeconds;
}

function CardIcon({ kind }: { kind: 'clock' | 'quote' | 'profit' }) {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      {kind === 'clock' ? (
        <path
          d="M12 7v5l3 2M20 12a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.8"
        />
      ) : null}
      {kind === 'quote' ? (
        <path
          d="M6 18h12M7 6h10v10H7zM10 9h4M10 12h6"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.8"
        />
      ) : null}
      {kind === 'profit' ? (
        <path
          d="M5 15l4-4 3 3 7-7M16 7h3v3"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.8"
        />
      ) : null}
    </svg>
  );
}

function TrendPill({ direction, value, tone }: DashboardSummary['summaryCards'][number]['trend']) {
  const palette =
    tone === 'negative'
      ? 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200'
      : tone === 'neutral'
        ? 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
        : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200';

  const arrow = direction === 'down' ? '↘' : direction === 'flat' ? '→' : '↗';

  return (
    <div className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${palette}`}>
      <span>{arrow}</span>
      <span>{value}</span>
    </div>
  );
}

function SectionCard({
  title,
  children,
  action,
  className = '',
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
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

function SidebarItem({ item }: { item: NavItem }) {
  return (
    <button
      type="button"
      className={[
        'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition',
        item.active
          ? 'bg-sky-100 text-slate-950 shadow-sm dark:bg-slate-800 dark:text-slate-50'
          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-800/70 dark:hover:text-slate-50',
      ].join(' ')}
    >
      <svg viewBox="0 0 24 24" className="h-4.5 w-4.5 shrink-0" aria-hidden="true">
        {item.icon}
      </svg>
      <span>{item.label}</span>
    </button>
  );
}

export default function Dashboard() {
  const { data } = useGetDashboardSummaryQuery();
  const summary = data ?? FALLBACK_DASHBOARD_SUMMARY;
  const elapsedSeconds = useLiveTimer(summary);

  const chartData = useMemo(
    () =>
      summary.incomeVsExpenses.map((point) => ({
        ...point,
        incomeDisplay: point.income,
        expensesDisplay: point.expenses,
      })),
    [summary.incomeVsExpenses],
  );

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(37,99,235,0.08),transparent_28%),radial-gradient(circle_at_top_right,rgba(14,165,233,0.09),transparent_22%),linear-gradient(to_bottom,#f8fbff,#f4f7fb)] text-slate-900 dark:bg-[radial-gradient(circle_at_top_left,rgba(37,99,235,0.12),transparent_26%),radial-gradient(circle_at_top_right,rgba(15,23,42,0.6),transparent_30%),linear-gradient(to_bottom,#090b12,#0f131b)] dark:text-slate-100">
      <div className="mx-auto grid min-h-screen max-w-[1600px] grid-cols-1 xl:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="hidden border-r border-slate-200 bg-white/85 px-4 py-4 shadow-[inset_-1px_0_0_rgba(148,163,184,0.2)] backdrop-blur dark:border-slate-800 dark:bg-slate-950/85 xl:flex xl:flex-col">
          <div className="flex items-center gap-3 rounded-2xl px-2 py-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-600 text-lg font-semibold text-white shadow-lg shadow-sky-500/25 dark:bg-sky-500">
              F
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
              Track billable work and keep your active project visible from the dashboard.
            </p>
            <button
              type="button"
              className="mt-4 inline-flex items-center justify-center rounded-xl bg-sky-300 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-sky-200"
            >
              ▶ Start Session
            </button>
          </div>

          <nav className="mt-5 space-y-1">
            {NAV_ITEMS.map((item) => (
              <SidebarItem key={item.label} item={item} />
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
                {summary.greeting}, {summary.userName}
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Here&apos;s the current pulse of your freelance business.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <label className="relative hidden md:block">
                <span className="sr-only">Search invoices, clients, projects</span>
                <svg
                  viewBox="0 0 24 24"
                  className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500"
                  aria-hidden="true"
                >
                  <path
                    d="M10 18a8 8 0 1 1 5.293-14.01A8 8 0 0 1 10 18Zm7-1 4 4"
                    fill="none"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.8"
                  />
                </svg>
                <input
                  type="search"
                  placeholder="Search..."
                  className="w-57.5 rounded-full border border-slate-200 bg-white px-11 py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-sky-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500"
                />
              </label>
              <button
                type="button"
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition hover:text-slate-950 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300 dark:hover:text-slate-50"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
                  <path
                    d="M12 5a5 5 0 0 0-5 5v3l-1.5 2h13L17 13v-3a5 5 0 0 0-5-5Z"
                    fill="none"
                    stroke="currentColor"
                    strokeLinejoin="round"
                    strokeWidth="1.8"
                  />
                </svg>
              </button>
              <button
                type="button"
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition hover:text-slate-950 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300 dark:hover:text-slate-50"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
                  <path
                    d="M12 10v.01M12 14h.01M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Z"
                    fill="none"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.8"
                  />
                </svg>
              </button>
              <button
                type="button"
                className="inline-flex h-10 items-center gap-2 rounded-full bg-sky-600 px-4 text-sm font-semibold text-white shadow-lg shadow-sky-500/20 transition hover:bg-sky-500"
              >
                <span className="text-lg leading-none">+</span>
                New Invoice
              </button>
            </div>
          </header>

          <div className="mt-6 grid gap-4 xl:grid-cols-3">
            {summary.summaryCards.map((card) => (
              <article
                key={card.label}
                className="rounded-[1.35rem] border border-slate-200 bg-white p-5 shadow-[0_12px_24px_-20px_rgba(15,23,42,0.35)] dark:border-slate-800 dark:bg-slate-950/80"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-[0.72rem] font-medium uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                      {card.label}
                    </div>
                    <div className="mt-3 text-[2rem] font-semibold tracking-tight text-slate-950 dark:text-slate-50">
                      {card.formattedValue ?? formatHours(card.value)}
                    </div>
                  </div>

                  {card.icon ? (
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-300">
                      <CardIcon kind={card.icon} />
                    </div>
                  ) : null}
                </div>

                <div className="mt-4">
                  <TrendPill {...card.trend} />
                </div>
              </article>
            ))}
          </div>

          <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.78fr)]">
            <SectionCard
              title="Active Session"
              action={
                <span className="rounded-full bg-sky-100 px-3 py-1 text-[11px] font-semibold text-sky-700 dark:bg-sky-500/10 dark:text-sky-300">
                  {summary.activeSession.projectName}
                </span>
              }
            >
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                <div className="space-y-4">
                  <div className="text-[2.25rem] font-semibold tracking-tight text-slate-950 dark:text-slate-50 sm:text-[2.8rem]">
                    {formatTimer(elapsedSeconds)}
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                      <span className="h-2 w-2 rounded-full bg-orange-400" />
                      Project: {summary.activeSession.projectName}
                    </div>
                    <button
                      type="button"
                      className="inline-flex h-10 items-center justify-center rounded-xl border border-sky-300 bg-sky-50 px-4 text-sm font-semibold text-sky-700 transition hover:bg-sky-100 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300"
                    >
                      Resume
                    </button>
                    <button
                      type="button"
                      className="inline-flex h-10 items-center justify-center rounded-xl border border-rose-200 bg-rose-50 px-4 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300"
                    >
                      End Session
                    </button>
                  </div>
                </div>

                <div className="grid min-w-45 gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/70">
                  <div>
                    <div className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                      Daily Total
                    </div>
                    <div className="mt-1 text-2xl font-semibold tracking-tight text-slate-950 dark:text-slate-50">
                      {formatCurrency(summary.activeSession.dailyTotal)}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-950 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:border-slate-500"
                  >
                    Convert to Invoice
                  </button>
                </div>
              </div>
            </SectionCard>

            <SectionCard
              title="File Organizer"
              className="h-full"
              action={
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">4 shortcuts</span>
              }
            >
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  {['Auto-Sort', 'Bulk Rename', 'Archive'].map((action) => (
                    <button
                      key={action}
                      type="button"
                      className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:text-slate-100"
                    >
                      {action}
                    </button>
                  ))}
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-900/70">
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                    Recent Log
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-700 dark:text-slate-300">
                    12 files sorted to /Nexus/Project_Alpha
                  </p>
                </div>
              </div>
            </SectionCard>
          </div>

          <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.92fr)]">
            <SectionCard
              title="Income vs Expenses"
              action={
                <span className="rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-500 dark:border-slate-700 dark:text-slate-400">
                  Last 6 Months
                </span>
              }
              className="min-h-82.5"
            >
              <div className="h-62.5">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="4 8" stroke="rgba(148,163,184,0.16)" vertical={false} />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} stroke="currentColor" />
                    <YAxis tickLine={false} axisLine={false} width={42} stroke="currentColor" />
                    <Tooltip
                      contentStyle={{
                        background: 'rgba(15, 23, 42, 0.96)',
                        border: '1px solid rgba(148, 163, 184, 0.22)',
                        borderRadius: 16,
                        color: '#f8fafc',
                        boxShadow: '0 20px 40px -24px rgba(15, 23, 42, 0.9)',
                      }}
                      labelStyle={{ color: '#cbd5e1', fontWeight: 600 }}
                      formatter={(value: number, name: string) => [formatCurrency(value), name]}
                    />
                    <Bar dataKey="incomeDisplay" name="Income" radius={[8, 8, 0, 0]}>
                      {chartData.map((entry, index) => (
                        <Cell key={`income-${entry.label}`} fill={index % 2 === 0 ? '#2563eb' : '#3b82f6'} />
                      ))}
                    </Bar>
                    <Bar dataKey="expensesDisplay" name="Expenses" radius={[8, 8, 0, 0]}>
                      {chartData.map((entry, index) => (
                        <Cell key={`expenses-${entry.label}`} fill={PIPELINE_COLORS[index % PIPELINE_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
                <span className="inline-flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-blue-600" /> Income
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-orange-500" /> Expenses
                </span>
              </div>
            </SectionCard>

            <SectionCard title="Deal Pipeline" action={<span className="text-xs text-slate-500 dark:text-slate-400">3 stages</span>}>
              <div className="grid gap-3">
                {summary.dealPipeline.map((stage, index) => (
                  <div
                    key={stage.label}
                    className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/80"
                  >
                    <div className="flex items-center gap-3">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: PIPELINE_COLORS[index % PIPELINE_COLORS.length] }} />
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{stage.label}</span>
                    </div>
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-sm font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                      {stage.count}
                    </span>
                  </div>
                ))}
              </div>
            </SectionCard>
          </div>

          <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.92fr)]">
            <SectionCard
              title="Recent Invoices"
              action={<span className="text-sm font-medium text-sky-600 dark:text-sky-400">View All</span>}
            >
              <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800">
                <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800">
                  <thead className="bg-slate-50 dark:bg-slate-900/70">
                    <tr className="text-left text-[11px] uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                      <th className="px-4 py-3 font-semibold">Client</th>
                      <th className="px-4 py-3 font-semibold">Amount</th>
                      <th className="px-4 py-3 font-semibold">Due Date</th>
                      <th className="px-4 py-3 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-800 dark:bg-slate-950">
                    {summary.recentInvoices.map((invoice) => (
                      <tr key={invoice.id} className="text-sm text-slate-700 dark:text-slate-200">
                        <td className="px-4 py-4 font-medium text-slate-900 dark:text-slate-100">{invoice.client}</td>
                        <td className="px-4 py-4">{formatCurrency(invoice.amount)}</td>
                        <td className="px-4 py-4">{invoice.date}</td>
                        <td className="px-4 py-4">
                          <span
                            className={[
                              'inline-flex rounded-md px-2.5 py-1 text-xs font-semibold',
                              invoice.status === 'Pending'
                                ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'
                                : invoice.status === 'Overdue'
                                  ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300'
                                  : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
                            ].join(' ')}
                          >
                            {invoice.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SectionCard>

            <SectionCard title="Recent Files">
              <div className="space-y-3">
                {summary.recentFiles.map((file) => (
                  <div
                    key={file.id}
                    className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/75"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                        <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
                          {file.icon === 'pdf' ? (
                            <path
                              d="M7 4h7l4 4v12H7zM14 4v4h4M9 13h6M9 16h4"
                              fill="none"
                              stroke="currentColor"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="1.6"
                            />
                          ) : null}
                          {file.icon === 'zip' ? (
                            <path
                              d="M8 4h8v4H8zM6 8h12v12H6zM10 12h4M10 16h4"
                              fill="none"
                              stroke="currentColor"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="1.6"
                            />
                          ) : null}
                          {file.icon === 'doc' ? (
                            <path
                              d="M7 4h7l4 4v12H7zM14 4v4h4M9 12h7M9 15h6"
                              fill="none"
                              stroke="currentColor"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="1.6"
                            />
                          ) : null}
                          {file.icon === 'file' ? (
                            <path
                              d="M7 4h7l4 4v12H7zM14 4v4h4"
                              fill="none"
                              stroke="currentColor"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="1.6"
                            />
                          ) : null}
                        </svg>
                      </div>

                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {file.name}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">{file.meta}</div>
                      </div>
                    </div>

                    <button
                      type="button"
                      className="ml-3 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-200 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                    >
                      <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
                        <path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            </SectionCard>
          </div>
        </main>
      </div>
    </div>
  );
}