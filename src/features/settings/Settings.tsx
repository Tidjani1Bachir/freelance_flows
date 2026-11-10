import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useUpdateSettingsMutation, useGetSettingsQuery, type SettingsResponse, type SettingsState } from './settingsApi';

type SettingsTab = 'general' | 'finance' | 'files' | 'notifications' | 'security' | 'about';

type SecurityModalMode = 'export' | 'restore' | 'clear' | null;

type SettingsFormState = SettingsState & {
  taxEnabled: boolean;
};

const DEFAULT_CONFIRMATION = 'CLEAR DATA';

const TABS: Array<{ id: SettingsTab; label: string }> = [
  { id: 'general', label: 'General' },
  { id: 'finance', label: 'Finance' },
  { id: 'files', label: 'Files' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'security', label: 'Security' },
  { id: 'about', label: 'About' },
];

const LANGUAGE_OPTIONS = ['English', 'Spanish', 'French', 'German'];
const TIMEZONE_OPTIONS = ['UTC-05:00 Eastern Time', 'UTC', 'UTC+01:00 Central European Time', 'UTC+05:30 India Standard Time'];
const CURRENCY_OPTIONS = ['USD ($)', 'EUR (€)', 'GBP (£)', 'CAD ($)'];
const PAYMENT_TERM_OPTIONS = ['Net 7', 'Net 15', 'Net 30', 'Due on Receipt'];

function formatSettingsResponse(response: SettingsResponse): SettingsFormState {
  return {
    profile: {
      name: response.profile.name,
      email: response.profile.email,
      language: response.profile.language,
      timezone: response.profile.timezone,
    },
    currency: response.currency,
    taxRate: response.taxRate,
    invoicePrefix: response.invoicePrefix,
    paymentTerms: response.paymentTerms,
    taxEnabled: response.taxRate > 0,
  };
}

function createInitialState(): SettingsFormState {
  return formatSettingsResponse({
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
  });
}

function deepCloneSettings(state: SettingsFormState): SettingsFormState {
  return {
    profile: { ...state.profile },
    currency: state.currency,
    taxRate: state.taxRate,
    invoicePrefix: state.invoicePrefix,
    paymentTerms: state.paymentTerms,
    taxEnabled: state.taxEnabled,
  };
}

function settingsToComparable(state: SettingsFormState) {
  return JSON.stringify(state);
}

function toRequestPayload(state: SettingsFormState) {
  return {
    profile: {
      name: state.profile.name.trim(),
      email: state.profile.email.trim(),
      language: state.profile.language.trim(),
      timezone: state.profile.timezone.trim(),
    },
    currency: state.currency.trim(),
    taxRate: state.taxEnabled ? state.taxRate : 0,
    invoicePrefix: state.invoicePrefix.trim(),
    paymentTerms: state.paymentTerms.trim(),
  } satisfies SettingsState;
}

async function apiFetch(path: string, init: RequestInit = {}) {
  const response = await fetch(`http://127.0.0.1:${window.__APP_PORT__}/api${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${window.__APP_TOKEN__}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });

  const contentType = response.headers.get('content-type') || '';
  const body = contentType.includes('application/json') ? await response.json() : await response.text();

  if (!response.ok) {
    const message = typeof body === 'string' ? body : body?.error?.message || body?.message || 'Request failed';
    throw new Error(message);
  }

  return body;
}

function ModalShell({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-4 backdrop-blur-sm">
      <div className="w-full max-w-120 rounded-[1.35rem] border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-800 dark:bg-slate-950">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-3 dark:border-slate-800">
          <h3 className="text-lg font-semibold text-slate-950 dark:text-slate-100">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
            aria-label="Close dialog"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
            </svg>
          </button>
        </div>
        <div className="pt-4">{children}</div>
      </div>
    </div>
  );
}

function SectionCard({
  title,
  icon,
  children,
  className = '',
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-[1.15rem] border border-slate-200 bg-white p-5 shadow-[0_12px_24px_-18px_rgba(15,23,42,0.35)] dark:border-slate-800 dark:bg-slate-950/80 ${className}`}>
      <div className="flex items-center gap-3 border-b border-slate-200 pb-3 dark:border-slate-800">
        <span className="text-sky-600 dark:text-sky-300">{icon}</span>
        <h2 className="text-[1.08rem] font-semibold tracking-tight text-slate-950 dark:text-slate-100">{title}</h2>
      </div>
      <div className="pt-4">{children}</div>
    </section>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-sky-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500"
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-sky-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function SwitchField({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  hint?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 dark:border-slate-800 dark:bg-slate-900/70">
      <div>
        <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{label}</div>
        {hint ? <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{hint}</div> : null}
      </div>
      <button
        type="button"
        aria-pressed={checked}
        onClick={() => onChange(!checked)}
        className={[
          'relative inline-flex h-6 w-11 items-center rounded-full transition',
          checked ? 'bg-sky-600' : 'bg-slate-300 dark:bg-slate-700',
        ].join(' ')}
      >
        <span
          className={[
            'inline-block h-5 w-5 rounded-full bg-white shadow transition-transform',
            checked ? 'translate-x-5' : 'translate-x-0.5',
          ].join(' ')}
        />
      </button>
    </div>
  );
}

function Spinner() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 animate-spin" aria-hidden="true">
      <path d="M12 2a10 10 0 1 0 10 10" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
    </svg>
  );
}

export default function Settings() {
  const { data } = useGetSettingsQuery();
  const [updateSettings, { isLoading: isSaving }] = useUpdateSettingsMutation();

  const initialValues = useMemo(() => {
    const source = data ?? {
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
    };

    return formatSettingsResponse(source as SettingsResponse);
  }, [data]);

  const [formState, setFormState] = useState<SettingsFormState>(() => deepCloneSettings(initialValues));
  const [baselineState, setBaselineState] = useState<SettingsFormState>(() => deepCloneSettings(initialValues));
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [securityMode, setSecurityMode] = useState<SecurityModalMode>(null);
  const [securityPath, setSecurityPath] = useState('');
  const [securityConfirmation, setSecurityConfirmation] = useState('');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  useEffect(() => {
    setFormState(deepCloneSettings(initialValues));
    setBaselineState(deepCloneSettings(initialValues));
  }, [initialValues]);

  const dirty = useMemo(
    () => settingsToComparable(formState) !== settingsToComparable(baselineState),
    [baselineState, formState],
  );

  function patchProfile(patch: Partial<SettingsFormState['profile']>) {
    setFormState((current) => ({
      ...current,
      profile: { ...current.profile, ...patch },
    }));
  }

  async function handleSave() {
    const payload = toRequestPayload(formState);
    const result = await updateSettings(payload).unwrap();
    const nextState = formatSettingsResponse(result);

    setFormState(deepCloneSettings(nextState));
    setBaselineState(deepCloneSettings(nextState));
    setStatusMessage('Settings saved.');
  }

  function handleReset() {
    setFormState(deepCloneSettings(baselineState));
    setStatusMessage('Changes reset.');
  }

  async function handleSecurityAction() {
    if (!securityMode) {
      return;
    }

    setActionBusy(true);
    setStatusMessage(null);

    try {
      if (securityMode === 'clear') {
        if (securityConfirmation.trim().toUpperCase() !== DEFAULT_CONFIRMATION) {
          throw new Error(`Type ${DEFAULT_CONFIRMATION} to confirm.`);
        }

        await apiFetch('/settings/clear-data', {
          method: 'DELETE',
          body: JSON.stringify({ confirmationToken: DEFAULT_CONFIRMATION }),
        });

        setStatusMessage('All data cleared.');
      } else if (securityMode === 'export') {
        await apiFetch('/settings/backup/export', {
          method: 'POST',
          body: JSON.stringify({ targetPath: securityPath.trim() }),
        });

        setStatusMessage('Backup exported.');
      } else if (securityMode === 'restore') {
        await apiFetch('/settings/backup/restore', {
          method: 'POST',
          body: JSON.stringify({ sourcePath: securityPath.trim(), confirmed: true }),
        });

        setStatusMessage('Backup restored. Restart required.');
      }

      setSecurityMode(null);
      setSecurityPath('');
      setSecurityConfirmation('');
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Action failed.');
    } finally {
      setActionBusy(false);
    }
  }

  const sidebarItems: Array<{ label: string; icon: ReactNode; active?: boolean }> = [
    {
      label: 'Dashboard',
      icon: <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" fill="currentColor" />,
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
      active: true,
      icon: (
        <path
          d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Zm8 3.5-1.7.9a6.9 6.9 0 0 1-.6 1.4l.5 1.8-1.7 1.7-1.8-.5a6.9 6.9 0 0 1-1.4.6L12 20l-1.3-1.6a6.9 6.9 0 0 1-1.4-.6l-1.8.5-1.7-1.7.5-1.8c.2.5.5.9.6 1.4L4 12l1.7-.9a6.9 6.9 0 0 1 .6-1.4L5.8 7.9l1.7-1.7 1.8.5a6.9 6.9 0 0 1 1.4-.6L12 4l1.3 1.6a6.9 6.9 0 0 1 1.4.6l1.8-.5 1.7 1.7-.5 1.8c.2.5.5.9.6 1.4Z"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.4"
        />
      ),
    },
  ];

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(37,99,235,0.08),transparent_28%),radial-gradient(circle_at_top_right,rgba(14,165,233,0.09),transparent_22%),linear-gradient(to_bottom,#f8fbff,#f4f7fb)] text-slate-900 dark:bg-[radial-gradient(circle_at_top_left,rgba(37,99,235,0.12),transparent_26%),radial-gradient(circle_at_top_right,rgba(15,23,42,0.6),transparent_30%),linear-gradient(to_bottom,#090b12,#0f131b)] dark:text-slate-100">
      {securityMode ? (
        <ModalShell
          title={securityMode === 'export' ? 'Export Backup' : securityMode === 'restore' ? 'Restore Data' : 'Clear Data'}
          onClose={() => {
            if (!actionBusy) {
              setSecurityMode(null);
              setSecurityPath('');
              setSecurityConfirmation('');
            }
          }}
        >
          <div className="space-y-4">
            <p className="text-sm leading-6 text-slate-600 dark:text-slate-400">
              {securityMode === 'clear'
                ? `Type ${DEFAULT_CONFIRMATION} to confirm permanent deletion.`
                : 'Enter a file path so the desktop shell can pass it to the backend.'}
            </p>
            <TextField
              label={securityMode === 'export' ? 'Target file path' : 'Backup file path'}
              value={securityPath}
              onChange={setSecurityPath}
              placeholder={securityMode === 'export' ? 'C:\\Backups\\freelanceflow-backup.zip' : 'C:\\Backups\\freelanceflow-backup.zip'}
            />
            {securityMode === 'clear' ? (
              <TextField
                label="Confirmation text"
                value={securityConfirmation}
                onChange={setSecurityConfirmation}
                placeholder={DEFAULT_CONFIRMATION}
              />
            ) : null}
            <div className="flex items-center justify-end gap-3 pt-1">
              <button
                type="button"
                onClick={() => {
                  if (!actionBusy) {
                    setSecurityMode(null);
                    setSecurityPath('');
                    setSecurityConfirmation('');
                  }
                }}
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-900"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSecurityAction}
                disabled={actionBusy || !securityPath.trim() || (securityMode === 'clear' && securityConfirmation.trim().toUpperCase() !== DEFAULT_CONFIRMATION)}
                className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {actionBusy ? <Spinner /> : null}
                {securityMode === 'export' ? 'Export' : securityMode === 'restore' ? 'Restore' : 'Clear'}
              </button>
            </div>
          </div>
        </ModalShell>
      ) : null}

      <div className="mx-auto grid min-h-screen max-w-[1600px] grid-cols-1 xl:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="hidden border-r border-slate-200 bg-white/85 px-4 py-4 backdrop-blur dark:border-slate-800 dark:bg-slate-950/85 xl:flex xl:flex-col">
          <div className="flex items-center gap-3 rounded-2xl px-2 py-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-sky-600 text-lg font-semibold text-white shadow-lg shadow-sky-500/25 dark:bg-sky-500">
              AR
            </div>
            <div>
              <div className="text-[1.02rem] font-semibold tracking-tight text-slate-950 dark:text-slate-100">
                Alex Rivers
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400">Pro Freelancer</div>
            </div>
          </div>

          <button
            type="button"
            className="mt-4 inline-flex items-center justify-center rounded-xl bg-sky-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-sky-500/20 transition hover:bg-sky-500"
          >
            + New Project
          </button>

          <nav className="mt-5 space-y-1">
            {sidebarItems.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => setActiveTab(item.active ? 'general' : activeTab)}
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
          <header className="flex flex-col gap-1 border-b border-slate-200 pb-4 dark:border-slate-800 xl:flex-row xl:items-end xl:justify-between xl:gap-4">
            <div>
              <h1 className="text-[2rem] font-semibold tracking-tight text-slate-950 dark:text-slate-100 sm:text-[2.15rem]">
                Settings
              </h1>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Manage app preferences and account
              </p>
            </div>
          </header>

          <div className="mt-6 grid gap-5 xl:grid-cols-[220px_minmax(0,1fr)_320px]">
            <aside className="space-y-1 self-start rounded-[1.15rem] border border-slate-200 bg-white p-2 shadow-[0_12px_24px_-18px_rgba(15,23,42,0.35)] dark:border-slate-800 dark:bg-slate-950/80">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={[
                    'block w-full rounded-lg px-3 py-2 text-left text-sm transition',
                    activeTab === tab.id
                      ? 'bg-slate-100 font-medium text-slate-950 dark:bg-slate-800 dark:text-slate-50'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950 dark:text-slate-400 dark:hover:bg-slate-900/70 dark:hover:text-slate-100',
                  ].join(' ')}
                >
                  {tab.label}
                </button>
              ))}
            </aside>

            <div className="space-y-5">
              <SectionCard
                title="General"
                icon={
                  <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
                    <path
                      d="M12 3a9 9 0 1 0 9 9A9 9 0 0 0 12 3Zm0 4v5l3 2"
                      fill="none"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="1.8"
                    />
                  </svg>
                }
              >
                <div className="grid gap-4 md:grid-cols-2">
                  <TextField label="Name" value={formState.profile.name} onChange={(value) => patchProfile({ name: value })} />
                  <TextField label="Email" value={formState.profile.email} onChange={(value) => patchProfile({ email: value })} />
                  <SelectField label="Language" value={formState.profile.language} onChange={(value) => patchProfile({ language: value })} options={LANGUAGE_OPTIONS} />
                  <SelectField label="Timezone" value={formState.profile.timezone} onChange={(value) => patchProfile({ timezone: value })} options={TIMEZONE_OPTIONS} />
                </div>
              </SectionCard>

              <SectionCard
                title="Finance"
                icon={
                  <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
                    <path
                      d="M4 6h16v12H4zM8 10h8M8 14h5"
                      fill="none"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="1.8"
                    />
                  </svg>
                }
              >
                <div className="grid gap-4 md:grid-cols-2">
                  <SelectField label="Currency" value={formState.currency} onChange={(value) => setFormState((current) => ({ ...current, currency: value }))} options={CURRENCY_OPTIONS} />
                  <TextField label="Invoice Prefix" value={formState.invoicePrefix} onChange={(value) => setFormState((current) => ({ ...current, invoicePrefix: value }))} />
                </div>

                <div className="mt-4 space-y-4">
                  <SwitchField
                    label="Apply Tax (VAT/GST/Sales) globally to invoices"
                    checked={formState.taxEnabled}
                    onChange={(value) => setFormState((current) => ({ ...current, taxEnabled: value }))}
                    hint={formState.taxEnabled ? `Default tax rate: ${formState.taxRate}%` : 'Tax is disabled for new invoices.'}
                  />

                  <SelectField
                    label="Payment Terms"
                    value={formState.paymentTerms}
                    onChange={(value) => setFormState((current) => ({ ...current, paymentTerms: value }))}
                    options={PAYMENT_TERM_OPTIONS}
                  />
                </div>
              </SectionCard>
            </div>

            <div className="space-y-5 self-start">
              <SectionCard
                title="Data Security"
                icon={
                  <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
                    <path
                      d="M12 3 5 6v5c0 5 3 8 7 10 4-2 7-5 7-10V6z"
                      fill="none"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="1.8"
                    />
                  </svg>
                }
              >
                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={() => setSecurityMode('export')}
                    className="inline-flex w-full items-center justify-center rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-500"
                  >
                    Export Backup
                  </button>
                  <button
                    type="button"
                    onClick={() => setSecurityMode('restore')}
                    className="inline-flex w-full items-center justify-center rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-900"
                  >
                    Restore Data
                  </button>
                  <button
                    type="button"
                    onClick={() => setSecurityMode('clear')}
                    className="inline-flex w-full items-center justify-center rounded-xl border border-rose-300 px-4 py-2.5 text-sm font-semibold text-rose-600 transition hover:bg-rose-50 dark:border-rose-400/40 dark:text-rose-300 dark:hover:bg-rose-500/10"
                  >
                    Clear Data
                  </button>
                </div>
              </SectionCard>

              <SectionCard
                title="About"
                icon={
                  <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
                    <path d="M12 10v6M12 7h.01M12 3a9 9 0 1 0 9 9A9 9 0 0 0 12 3Z" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
                  </svg>
                }
              >
                <div className="space-y-3 text-sm text-slate-600 dark:text-slate-400">
                  <p>FreelanceFlow desktop workspace settings.</p>
                  <p>Database: {data?.databaseFile ?? 'freelanceflow.db'}</p>
                </div>
              </SectionCard>
            </div>
          </div>

          <footer className="sticky bottom-0 z-10 mt-6 border-t border-slate-200 bg-white/90 px-4 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
            <div className="mx-auto flex max-w-[calc(100vw-2rem)] items-center justify-between gap-3">
              <button
                type="button"
                onClick={handleReset}
                disabled={!dirty || isSaving}
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-900"
              >
                Reset
              </button>

              <div className="flex items-center gap-3">
                {statusMessage ? <div className="hidden text-sm text-slate-500 sm:block dark:text-slate-400">{statusMessage}</div> : null}
                <button
                  type="button"
                  onClick={() => {
                    void handleSave();
                  }}
                  disabled={!dirty || isSaving}
                  className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSaving ? <Spinner /> : null}
                  Save Changes
                </button>
              </div>
            </div>
          </footer>
        </main>
      </div>
    </div>
  );
}