import { useEffect, useMemo, useRef, useState } from 'react';
import {
  useGetTimeEntriesSummaryQuery,
  useStartTimeEntryMutation,
  useStopTimeEntryMutation,
  type TimeEntrySummary,
} from './timeTrackingApi';

type ProjectOption = {
  id: number;
  name: string;
  client: string;
  hourlyRate: number;
};

type SummaryCard = {
  label: string;
  value: string;
  sublabel: string;
};

const PROJECT_OPTIONS: ProjectOption[] = [
  { id: 1, name: 'Website Redesign', client: 'Acme Corp', hourlyRate: 85 },
  { id: 2, name: 'Brand Identity', client: 'Momentum Studios', hourlyRate: 75 },
  { id: 3, name: 'Internal Admin', client: 'Freelancer Pro', hourlyRate: 0 },
  { id: 4, name: 'API Migration', client: 'Stark Ind.', hourlyRate: 110 },
];

const FALLBACK_SUMMARY: TimeEntrySummary = {
  today: { amount: 124.5, duration: '4h 15m' },
  thisWeek: { amount: 850, duration: '22h 30m' },
  thisMonth: { amount: 3240, duration: '85h 00m' },
  uninvoiced: { amount: 3450, label: 'Ready to bill' },
  billableRatio: 0.85,
  billableBreakdown: { billable: 85, nonBillable: 15 },
  hoursByProject: [
    { projectName: 'Website Redesign', hours: 24 },
    { projectName: 'Brand Identity', hours: 12 },
    { projectName: 'Consulting', hours: 4 },
  ],
  recentEntries: [
    {
      id: 1,
      date: 'Today, 09:00 AM',
      projectName: 'Website Redesign',
      description: 'Initial client wireframe review',
      duration: '01:30:00',
      amount: 112.5,
      billable: true,
      status: 'Billable',
    },
    {
      id: 2,
      date: 'Yesterday, 02:15 PM',
      projectName: 'Internal Admin',
      description: 'Invoicing and CRM updates',
      duration: '00:45:00',
      amount: null,
      billable: false,
      status: 'Non-Billable',
    },
    {
      id: 3,
      date: 'Oct 24, 10:30 AM',
      projectName: 'Brand Identity',
      description: 'Logo concept sketching',
      duration: '03:15:00',
      amount: 243.75,
      billable: true,
      status: 'Billable',
    },
  ],
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

function formatLiveCurrency(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatTimer(seconds: number) {
  const safeSeconds = Math.max(0, seconds);
  const hours = Math.floor(safeSeconds / 3600)
    .toString()
    .padStart(2, '0');
  const minutes = Math.floor((safeSeconds % 3600) / 60)
    .toString()
    .padStart(2, '0');
  const remainingSeconds = (safeSeconds % 60).toString().padStart(2, '0');

  return `${hours}:${minutes}:${remainingSeconds}`;
}

function getSummarySource(summary?: TimeEntrySummary): TimeEntrySummary {
  return summary ?? FALLBACK_SUMMARY;
}

function StatCard({ label, value, sublabel }: SummaryCard) {
  return (
    <article className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--bg)] px-4 py-4 shadow-sm">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--text)]">
        {label}
      </div>
      <div className="mt-2 text-[28px] font-semibold leading-none text-[color:var(--text-h)]">
        {value}
      </div>
      <div className="mt-2 text-sm text-[color:var(--text)]">{sublabel}</div>
    </article>
  );
}

function SidebarIcon({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-inherit" aria-hidden="true">
      {children}
    </svg>
  );
}

export default function TimeTracker() {
  const { data: summaryData, isFetching: isSummaryFetching } = useGetTimeEntriesSummaryQuery();
  const [startTimeEntry, { isLoading: isStarting }] = useStartTimeEntryMutation();
  const [stopTimeEntry, { isLoading: isStopping }] = useStopTimeEntryMutation();

  const [selectedProjectId, setSelectedProjectId] = useState(PROJECT_OPTIONS[0].id);
  const [description, setDescription] = useState('Refactoring auth flow');
  const [billable, setBillable] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [entryDate, setEntryDate] = useState('');
  const [startTimeValue, setStartTimeValue] = useState('');
  const [endTimeValue, setEndTimeValue] = useState('');

  const startedAtRef = useRef<number | null>(null);
  const intervalRef = useRef<number | null>(null);

  const selectedProject = useMemo(
    () => PROJECT_OPTIONS.find((project) => project.id === selectedProjectId) ?? PROJECT_OPTIONS[0],
    [selectedProjectId],
  );

  const liveEarnings = (elapsedSeconds / 3600) * selectedProject.hourlyRate;
  const summary = getSummarySource(summaryData);

  const summaryCards: SummaryCard[] = [
    {
      label: 'Today',
      value: formatCurrency(summary.today.amount),
      sublabel: summary.today.duration,
    },
    {
      label: 'This Week',
      value: formatCurrency(summary.thisWeek.amount),
      sublabel: summary.thisWeek.duration,
    },
    {
      label: 'This Month',
      value: formatCurrency(summary.thisMonth.amount),
      sublabel: summary.thisMonth.duration,
    },
    {
      label: 'Uninvoiced',
      value: formatCurrency(summary.uninvoiced?.amount ?? 0),
      sublabel: summary.uninvoiced?.label ?? 'Ready to bill',
    },
  ];

  useEffect(() => {
    if (!isRunning || startedAtRef.current === null) {
      return undefined;
    }

    intervalRef.current = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAtRef.current!) / 1000));
    }, 1000);

    return () => {
      if (intervalRef.current !== null) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isRunning]);

  useEffect(() => {
    return () => {
      if (intervalRef.current !== null) {
        window.clearInterval(intervalRef.current);
      }
    };
  }, []);

  async function handleStart() {
    if (isRunning) {
      return;
    }

    const startedAt = Date.now();
    startedAtRef.current = startedAt;
    setElapsedSeconds(0);
    setIsRunning(true);

    try {
      const result = await startTimeEntry({
        projectId: selectedProject.id,
        description,
        billable,
        startedAt: new Date(startedAt).toISOString(),
      }).unwrap();

      setSessionId(result.id);
    } catch {
      startedAtRef.current = null;
      setElapsedSeconds(0);
      setIsRunning(false);
      setSessionId(null);
    }
  }

  async function handleStop() {
    if (!isRunning) {
      return;
    }

    setIsRunning(false);

    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    const stoppedAt = new Date().toISOString();

    try {
      if (sessionId !== null) {
        await stopTimeEntry({
          id: sessionId,
          stoppedAt,
        }).unwrap();
      }
    } finally {
      startedAtRef.current = null;
      setSessionId(null);
      setElapsedSeconds(0);
    }
  }

  return (
    <div className="min-h-screen bg-[color:var(--bg)] text-[color:var(--text-h)]">
      <div className="mx-auto grid min-h-screen max-w-[1440px] xl:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="hidden border-r border-[color:var(--border)] bg-[color:var(--bg)] px-4 py-4 xl:flex xl:flex-col">
          <div className="mb-6 flex items-center gap-3 px-2 py-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-[color:var(--accent)] text-lg font-semibold text-white shadow-sm">
              F
            </div>
            <div>
              <div className="text-[15px] font-semibold leading-none text-[color:var(--text-h)]">
                Freelancer Pro
              </div>
              <div className="mt-1 text-xs text-[color:var(--text)]">Managing Operations</div>
            </div>
          </div>

          <nav className="space-y-1 px-1">
            {[
              'Dashboard',
              'CRM Pipeline',
              'Invoices',
              'Time Tracking',
              'Earnings',
              'Settings',
            ].map((item) => {
              const active = item === 'Time Tracking';

              return (
                <button
                  key={item}
                  type="button"
                  className={[
                    'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition',
                    active
                      ? 'bg-[color:var(--accent-bg)] text-[color:var(--accent)] shadow-sm'
                      : 'text-[color:var(--text)] hover:bg-[color:var(--social-bg)] hover:text-[color:var(--text-h)]',
                  ].join(' ')}
                >
                  <span className="inline-flex h-5 w-5 items-center justify-center">
                    <SidebarIcon>
                      <path
                        d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z"
                        fill="currentColor"
                      />
                    </SidebarIcon>
                  </span>
                  {item}
                </button>
              );
            })}
          </nav>

          <div className="mt-auto space-y-3 border-t border-[color:var(--border)] pt-4">
            <button
              type="button"
              className="flex w-full items-center gap-3 rounded-xl bg-[color:var(--accent)] px-3 py-3 text-sm font-semibold text-white shadow-sm transition hover:opacity-95"
            >
              <span className="text-lg leading-none">▸</span>
              Start Session
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-[color:var(--text)] transition hover:bg-[color:var(--social-bg)] hover:text-[color:var(--text-h)]"
            >
              Help Center
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-[color:var(--text)] transition hover:bg-[color:var(--social-bg)] hover:text-[color:var(--text-h)]"
            >
              Logout
            </button>
          </div>
        </aside>

        <main className="flex min-w-0 flex-col px-4 py-4 sm:px-6 lg:px-8">
          <header className="mb-5 flex items-center justify-between border-b border-[color:var(--border)] pb-4">
            <h1 className="text-2xl font-semibold tracking-tight text-[color:var(--accent)] sm:text-[26px]">
              Freelancer Business Manager
            </h1>

            <div className="flex items-center gap-3">
              <label className="relative hidden sm:block">
                <span className="sr-only">Search tasks, clients</span>
                <svg viewBox="0 0 24 24" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--text)]" aria-hidden="true">
                  <path d="M10 18a8 8 0 1 1 5.293-14.01A8 8 0 0 1 10 18Zm7-1 4 4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
                </svg>
                <input
                  type="search"
                  placeholder="Search..."
                  className="w-[190px] rounded-full border border-[color:var(--border)] bg-[color:var(--bg)] px-10 py-2 text-sm text-[color:var(--text-h)] outline-none placeholder:text-[color:var(--text)] focus:border-[color:var(--accent-border)]"
                />
              </label>
              <button type="button" className="text-[color:var(--text)] transition hover:text-[color:var(--text-h)]">
                <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
                  <path d="M12 5a5 5 0 0 0-5 5v3l-1.5 2h13L17 13v-3a5 5 0 0 0-5-5Z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8" />
                </svg>
              </button>
              <button type="button" className="text-[color:var(--text)] transition hover:text-[color:var(--text-h)]">
                <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
                  <path d="M12 10v.01M12 14h.01M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Z" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
                </svg>
              </button>
              <button type="button" className="h-8 w-8 overflow-hidden rounded-full border border-[color:var(--border)] bg-[color:var(--accent-bg)]">
                <img
                  alt="Profile"
                  src="https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=120&q=80"
                  className="h-full w-full object-cover"
                />
              </button>
            </div>
          </header>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_260px]">
            <section className="min-w-0">
              <div className="mb-6 flex items-end justify-between gap-4">
                <div>
                  <h2 className="text-3xl font-semibold tracking-tight text-[color:var(--text-h)] sm:text-[40px]">
                    Time & Earnings
                  </h2>
                  <p className="mt-1 text-sm text-[color:var(--text)] sm:text-base">
                    Track your hours and monitor your income.
                  </p>
                </div>
              </div>

              <div className="mb-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)] 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <article className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--bg)] p-4 shadow-sm">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex items-center gap-3">
                      <div className="font-mono text-[44px] font-semibold leading-none tracking-tight text-[color:var(--text-h)]">
                        {formatTimer(elapsedSeconds)}
                      </div>
                      <button
                        type="button"
                        onClick={handleStart}
                        disabled={isRunning || isStarting || isStopping}
                        className="inline-flex h-12 w-12 items-center justify-center rounded-lg bg-[#2563eb] text-white shadow-sm transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40"
                        aria-label="Start timer"
                      >
                        ▶
                      </button>
                      <button
                        type="button"
                        onClick={handleStop}
                        disabled={!isRunning || isStopping || isStarting}
                        className="inline-flex h-12 w-12 items-center justify-center rounded-lg bg-[#dc2626] text-white shadow-sm transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40"
                        aria-label="Stop timer"
                      >
                        ■
                      </button>
                    </div>

                    <div className="grid flex-1 gap-3 lg:grid-cols-[120px_minmax(0,1fr)_auto]">
                      <label className="space-y-1">
                        <span className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--text)]">
                          Project
                        </span>
                        <select
                          value={selectedProjectId}
                          onChange={(event) => setSelectedProjectId(Number(event.target.value))}
                          className="w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--bg)] px-3 py-2 text-sm text-[color:var(--text-h)] outline-none focus:border-[color:var(--accent-border)]"
                        >
                          {PROJECT_OPTIONS.map((project) => (
                            <option key={project.id} value={project.id}>
                              {project.client}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="space-y-1">
                        <span className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--text)]">
                          What are you working on?
                        </span>
                        <input
                          value={description}
                          onChange={(event) => setDescription(event.target.value)}
                          placeholder="Refactoring auth flow"
                          className="w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--bg)] px-3 py-2 text-sm text-[color:var(--text-h)] outline-none placeholder:text-[color:var(--text)] focus:border-[color:var(--accent-border)]"
                        />
                      </label>

                      <div className="flex flex-col items-end justify-between gap-2">
                        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--text)]">
                          Billable
                          <button
                            type="button"
                            onClick={() => setBillable((current) => !current)}
                            className={[
                              'relative h-6 w-11 rounded-full border transition',
                              billable
                                ? 'border-[#2563eb] bg-[#2563eb]'
                                : 'border-[color:var(--border)] bg-[color:var(--social-bg)]',
                            ].join(' ')}
                            aria-pressed={billable}
                            aria-label="Toggle billable"
                          >
                            <span
                              className={[
                                'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform',
                                billable ? 'translate-x-5' : 'translate-x-0.5',
                              ].join(' ')}
                            />
                          </button>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-semibold text-[#2563eb]">
                            {formatLiveCurrency(liveEarnings)} earned
                          </div>
                          <div className="text-xs text-[color:var(--text)]">
                            {selectedProject.hourlyRate > 0
                              ? `$${selectedProject.hourlyRate}/hr`
                              : 'Internal task'}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </article>
              </div>

              <div className="mb-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {summaryCards.map((card) => (
                  <StatCard key={card.label} {...card} />
                ))}
              </div>

              <section className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--bg)] shadow-sm">
                <div className="flex items-center justify-between gap-4 border-b border-[color:var(--border)] px-4 py-3">
                  <h3 className="text-lg font-semibold text-[color:var(--text-h)]">Recent Entries</h3>
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-lg border border-[color:var(--border)] px-3 py-2 text-sm text-[color:var(--text-h)] transition hover:border-[color:var(--accent-border)] hover:bg-[color:var(--social-bg)]"
                  >
                    ⬇ Export CSV
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full border-separate border-spacing-0">
                    <thead>
                      <tr className="text-left text-[10px] uppercase tracking-[0.18em] text-[color:var(--text)]">
                        <th className="border-b border-[color:var(--border)] px-4 py-3 font-semibold">Date</th>
                        <th className="border-b border-[color:var(--border)] px-4 py-3 font-semibold">Project</th>
                        <th className="border-b border-[color:var(--border)] px-4 py-3 font-semibold">Description</th>
                        <th className="border-b border-[color:var(--border)] px-4 py-3 font-semibold">Duration</th>
                        <th className="border-b border-[color:var(--border)] px-4 py-3 font-semibold">Amount</th>
                        <th className="border-b border-[color:var(--border)] px-4 py-3 font-semibold">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(summary.recentEntries ?? FALLBACK_SUMMARY.recentEntries ?? []).map((entry) => (
                        <tr key={entry.id} className="text-sm text-[color:var(--text-h)]">
                          <td className="border-b border-[color:var(--border)] px-4 py-4 align-top text-[color:var(--text)]">
                            {entry.date}
                          </td>
                          <td className="border-b border-[color:var(--border)] px-4 py-4 align-top">
                            <div className="font-medium">{entry.projectName}</div>
                          </td>
                          <td className="border-b border-[color:var(--border)] px-4 py-4 align-top text-[color:var(--text)]">
                            {entry.description}
                          </td>
                          <td className="border-b border-[color:var(--border)] px-4 py-4 align-top font-mono text-[color:var(--text-h)]">
                            {entry.duration}
                          </td>
                          <td className="border-b border-[color:var(--border)] px-4 py-4 align-top text-[color:var(--text-h)]">
                            {entry.amount === null ? '-' : formatCurrency(entry.amount)}
                          </td>
                          <td className="border-b border-[color:var(--border)] px-4 py-4 align-top">
                            <span
                              className={[
                                'inline-flex rounded-full px-2.5 py-1 text-xs font-semibold',
                                entry.billable
                                  ? 'bg-emerald-500/15 text-emerald-500'
                                  : 'bg-slate-500/15 text-slate-500',
                              ].join(' ')}
                            >
                              {entry.status ?? (entry.billable ? 'Billable' : 'Non-Billable')}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="border-t border-[color:var(--border)] px-4 py-3 text-center text-sm text-[color:var(--accent)]">
                  View All Entries
                </div>
              </section>
            </section>

            <aside className="space-y-4 xl:pt-10">
              <section className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--bg)] p-4 shadow-sm">
                <h3 className="text-lg font-semibold text-[color:var(--text-h)]">Manual Time Entry</h3>

                <div className="mt-4 space-y-4 text-sm">
                  <label className="block space-y-1">
                    <span className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--text)]">
                      Date
                    </span>
                    <input
                      value={entryDate}
                      onChange={(event) => setEntryDate(event.target.value)}
                      type="date"
                      className="w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--bg)] px-3 py-2 text-[color:var(--text-h)] outline-none focus:border-[color:var(--accent-border)]"
                    />
                  </label>

                  <label className="block space-y-1">
                    <span className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--text)]">
                      Project
                    </span>
                    <select
                      value={selectedProjectId}
                      onChange={(event) => setSelectedProjectId(Number(event.target.value))}
                      className="w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--bg)] px-3 py-2 text-[color:var(--text-h)] outline-none focus:border-[color:var(--accent-border)]"
                    >
                      {PROJECT_OPTIONS.map((project) => (
                        <option key={project.id} value={project.id}>
                          {project.client} - {project.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className="grid grid-cols-2 gap-3">
                    <label className="space-y-1">
                      <span className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--text)]">
                        Start Time
                      </span>
                      <input
                        value={startTimeValue}
                        onChange={(event) => setStartTimeValue(event.target.value)}
                        type="time"
                        className="w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--bg)] px-3 py-2 text-[color:var(--text-h)] outline-none focus:border-[color:var(--accent-border)]"
                      />
                    </label>

                    <label className="space-y-1">
                      <span className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--text)]">
                        End Time
                      </span>
                      <input
                        value={endTimeValue}
                        onChange={(event) => setEndTimeValue(event.target.value)}
                        type="time"
                        className="w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--bg)] px-3 py-2 text-[color:var(--text-h)] outline-none focus:border-[color:var(--accent-border)]"
                      />
                    </label>
                  </div>

                  <label className="block space-y-1">
                    <span className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--text)]">
                      Description
                    </span>
                    <textarea
                      value={description}
                      onChange={(event) => setDescription(event.target.value)}
                      rows={4}
                      className="w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--bg)] px-3 py-2 text-[color:var(--text-h)] outline-none focus:border-[color:var(--accent-border)]"
                    />
                  </label>

                  <label className="flex items-center gap-3 text-sm text-[color:var(--text-h)]">
                    <button
                      type="button"
                      onClick={() => setBillable((current) => !current)}
                      className={[
                        'relative h-6 w-11 rounded-full border transition',
                        billable
                          ? 'border-[#2563eb] bg-[#2563eb]'
                          : 'border-[color:var(--border)] bg-[color:var(--social-bg)]',
                      ].join(' ')}
                    >
                      <span
                        className={[
                          'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform',
                          billable ? 'translate-x-5' : 'translate-x-0.5',
                        ].join(' ')}
                      />
                    </button>
                    Billable entry
                  </label>

                  <button
                    type="button"
                    className="w-full rounded-lg bg-[#2563eb] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:brightness-105"
                  >
                    Add Entry
                  </button>
                </div>
              </section>

              <section className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--bg)] p-4 shadow-sm">
                <h3 className="text-lg font-semibold text-[color:var(--text-h)]">Weekly Overview</h3>

                <div className="mt-5 space-y-5">
                  <div>
                    <div className="mb-2 flex items-center justify-between text-sm font-semibold uppercase tracking-[0.18em] text-[color:var(--text)]">
                      <span>Billable Ratio</span>
                      <span>{Math.round((summary.billableRatio ?? 0.85) * 100)}%</span>
                    </div>

                    <div className="h-2 overflow-hidden rounded-full bg-[color:var(--social-bg)]">
                      <div
                        className="h-full rounded-full bg-[#2563eb]"
                        style={{ width: `${Math.round((summary.billableRatio ?? 0.85) * 100)}%` }}
                      />
                    </div>
                    <div className="mt-2 text-xs text-[color:var(--text)]">Target: 80%</div>
                  </div>

                  <div>
                    <div className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-[color:var(--text)]">
                      Hours by Project
                    </div>
                    <div className="space-y-3">
                      {(summary.hoursByProject ?? FALLBACK_SUMMARY.hoursByProject ?? []).map((item) => (
                        <div key={item.projectName}>
                          <div className="mb-1 flex items-center justify-between text-sm text-[color:var(--text-h)]">
                            <span>{item.projectName}</span>
                            <span>{item.hours}h</span>
                          </div>
                          <div className="h-2 rounded-full bg-[color:var(--social-bg)]">
                            <div
                              className="h-full rounded-full bg-[color:var(--text)]/60"
                              style={{ width: `${Math.min(100, (item.hours / 24) * 100)}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </section>

              {isSummaryFetching ? (
                <p className="text-sm text-[color:var(--text)]">Refreshing summary...</p>
              ) : null}
            </aside>
          </div>
        </main>
      </div>
    </div>
  );
}