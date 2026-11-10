import { useMemo, useState, type ReactNode } from 'react';
import {
  closestCorners,
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  type UniqueIdentifier,
} from '@dnd-kit/core';
import { type Lead, type LeadStage } from '../../api/apiSlice';
import { useGetLeadsQuery, useUpdateLeadStageMutation } from './crmApi';

type BoardStage = Exclude<LeadStage, 'lost'>;

type StageColumn = {
  stage: BoardStage;
  title: string;
  dotClass: string;
};

type SidebarItem = {
  label: string;
  icon: ReactNode;
  active?: boolean;
};

const PIPELINE_COLUMNS: StageColumn[] = [
  { stage: 'new_leads', title: 'New Leads', dotClass: 'bg-sky-500' },
  { stage: 'contacted', title: 'Contacted', dotClass: 'bg-amber-400' },
  { stage: 'proposal_sent', title: 'Proposal Sent', dotClass: 'bg-orange-500' },
  { stage: 'won', title: 'Won', dotClass: 'bg-emerald-500' },
];

const SIDEBAR_ITEMS: SidebarItem[] = [
  {
    label: 'Dashboard',
    icon: (
      <path
        d="M4 4h6v6H4zM14 4h6v10h-6zM4 14h6v6H4zM14 16h6v4h-6z"
        fill="currentColor"
      />
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
    active: true,
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
];

const CURRENCY_FORMATTER = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

function stageColumnId(stage: BoardStage): string {
  return `column-${stage}`;
}

function leadDragId(id: number): string {
  return `lead-${id}`;
}

function parseLeadId(identifier: UniqueIdentifier): number | null {
  const value = String(identifier);

  if (!value.startsWith('lead-')) {
    return null;
  }

  const parsed = Number(value.slice(5));

  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseStageFromDropTarget(identifier: UniqueIdentifier): BoardStage | null {
  const value = String(identifier);

  if (value.startsWith('column-')) {
    const stage = value.slice('column-'.length) as BoardStage;
    return stage;
  }

  if (value.startsWith('lead-')) {
    return null;
  }

  return null;
}

function formatLeadValue(value: number): string {
  return CURRENCY_FORMATTER.format(value);
}

function StageDot({ className }: { className: string }) {
  return <span className={`h-2.5 w-2.5 rounded-full ${className}`} aria-hidden="true" />;
}

function SidebarIcon({ icon }: { icon: ReactNode }) {
  return <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0">{icon}</svg>;
}

function LeadCardBody({ lead, overlay = false }: { lead: Lead; overlay?: boolean }) {
  const initial = lead.client_name.trim().slice(0, 1).toUpperCase() || 'L';
  const borderAccent =
    lead.stage === 'new_leads'
      ? 'border-l-sky-500'
      : lead.stage === 'contacted'
        ? 'border-l-amber-400'
        : lead.stage === 'proposal_sent'
          ? 'border-l-orange-500'
          : 'border-l-emerald-500';

  return (
    <article
      className={[
        'group rounded-2xl border border-[color:var(--border)] border-l-4 bg-[color:var(--bg)] p-4 text-left shadow-[var(--shadow)] transition-all',
        'hover:-translate-y-0.5 hover:border-[color:var(--accent-border)] hover:shadow-lg',
        borderAccent,
        overlay ? 'pointer-events-none rotate-[-1.5deg]' : '',
      ].join(' ')}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="rounded-lg bg-[color:var(--accent-bg)] px-2 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-[color:var(--accent)]">
          {lead.project_type ?? 'Lead'}
        </span>
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[color:var(--accent-bg)] text-sm font-semibold text-[color:var(--accent)]">
          {initial}
        </div>
      </div>

      <h3 className="text-[15px] font-semibold leading-5 text-[color:var(--text-h)]">
        {lead.client_name}
      </h3>

      <p className="mt-1 text-sm leading-5 text-[color:var(--text)]">
        {lead.notes ?? lead.email ?? 'No notes added yet.'}
      </p>

      <div className="mt-4 flex items-end justify-between gap-3">
        <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-[color:var(--text-h)]">
          <svg viewBox="0 0 24 24" className="h-4 w-4 text-[color:var(--accent)]" aria-hidden="true">
            <path d="M4 7h16v10H4zM8 10h8M8 14h5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" />
          </svg>
          {formatLeadValue(lead.value)}
        </span>

        <span className="text-xs text-[color:var(--text)]">
          #{lead.id}
        </span>
      </div>
    </article>
  );
}

function LeadCard({ lead, overlay = false }: { lead: Lead; overlay?: boolean }) {
  if (overlay) {
    return <LeadCardBody lead={lead} overlay />;
  }

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: leadDragId(lead.id),
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
      }}
      className={isDragging ? 'opacity-40' : 'opacity-100'}
    >
      <LeadCardBody lead={lead} />
    </div>
  );
}

function LeadColumn({
  title,
  stage,
  dotClass,
  leads,
  isOver,
  isLoading,
}: {
  title: string;
  stage: BoardStage;
  dotClass: string;
  leads: Lead[];
  isOver: boolean;
  isLoading: boolean;
}) {
  const { setNodeRef, isOver: isDroppableOver } = useDroppable({ id: stageColumnId(stage) });

  return (
    <section
      ref={setNodeRef}
      className={[
        'flex min-h-[620px] min-w-[270px] flex-col rounded-3xl border border-[color:var(--border)] bg-[color:var(--social-bg)]/80 p-4 shadow-[var(--shadow)] transition-colors',
        isOver || isDroppableOver ? 'border-[color:var(--accent-border)] bg-[color:var(--accent-bg)]/40' : '',
      ].join(' ')}
    >
      <header className="mb-4 flex items-center justify-between gap-3 border-b border-[color:var(--border)] pb-3">
        <div className="flex items-center gap-2">
          <StageDot className={dotClass} />
          <h2 className="text-base font-semibold text-[color:var(--text-h)]">{title}</h2>
        </div>

        <span className="rounded-full bg-[color:var(--bg)] px-2.5 py-1 text-xs font-semibold text-[color:var(--text)] shadow-sm">
          {leads.length}
        </span>
      </header>

      <div className="flex flex-1 flex-col gap-3">
        {leads.map((lead) => (
          <LeadCard key={lead.id} lead={lead} />
        ))}

        {isLoading ? (
          <div className="space-y-3">
            <div className="h-28 rounded-2xl border border-dashed border-[color:var(--border)] bg-[color:var(--bg)]/70" />
            <div className="h-28 rounded-2xl border border-dashed border-[color:var(--border)] bg-[color:var(--bg)]/70" />
          </div>
        ) : null}

        {!isLoading && leads.length === 0 ? (
          <div className="flex min-h-[160px] items-center justify-center rounded-2xl border border-dashed border-[color:var(--border)] bg-[color:var(--bg)]/60 text-sm text-[color:var(--text)]">
            Drop a lead here or add a new one.
          </div>
        ) : null}
      </div>
    </section>
  );
}

export default function CrmPipeline() {
  const [activeLeadId, setActiveLeadId] = useState<number | null>(null);
  const [activeLeadMutation] = useUpdateLeadStageMutation();

  const newLeadsQuery = useGetLeadsQuery({ stage: 'new_leads', limit: 100 });
  const contactedQuery = useGetLeadsQuery({ stage: 'contacted', limit: 100 });
  const proposalSentQuery = useGetLeadsQuery({ stage: 'proposal_sent', limit: 100 });
  const wonQuery = useGetLeadsQuery({ stage: 'won', limit: 100 });

  const groupedLeads = useMemo(
    () => ({
      new_leads: newLeadsQuery.data?.items ?? [],
      contacted: contactedQuery.data?.items ?? [],
      proposal_sent: proposalSentQuery.data?.items ?? [],
      won: wonQuery.data?.items ?? [],
    }) as Record<BoardStage, Lead[]>,
    [contactedQuery.data?.items, newLeadsQuery.data?.items, proposalSentQuery.data?.items, wonQuery.data?.items],
  );

  const leadById = useMemo(() => {
    const combined = [
      ...(newLeadsQuery.data?.items ?? []),
      ...(contactedQuery.data?.items ?? []),
      ...(proposalSentQuery.data?.items ?? []),
      ...(wonQuery.data?.items ?? []),
    ];

    return new Map(combined.map((lead) => [lead.id, lead]));
  }, [contactedQuery.data?.items, newLeadsQuery.data?.items, proposalSentQuery.data?.items, wonQuery.data?.items]);

  const allQueryLoading =
    newLeadsQuery.isLoading || contactedQuery.isLoading || proposalSentQuery.isLoading || wonQuery.isLoading;

  const dragSensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6,
      },
    }),
  );

  const activeLead = activeLeadId ? leadById.get(activeLeadId) ?? null : null;

  function handleDragStart(event: DragStartEvent) {
    const leadId = parseLeadId(event.active.id);
    setActiveLeadId(leadId);
  }

  function handleDragEnd(event: DragEndEvent) {
    const activeId = parseLeadId(event.active.id);
    const overId = event.over?.id;

    setActiveLeadId(null);

    if (!activeId || !overId) {
      return;
    }

    const activeLeadItem = leadById.get(activeId);

    if (!activeLeadItem) {
      return;
    }

    const targetStage = parseStageFromDropTarget(overId);

    if (!targetStage || activeLeadItem.stage === targetStage) {
      return;
    }

    const targetLeads = groupedLeads[targetStage];
    const targetPosition = targetLeads.length;

    void activeLeadMutation({
      id: activeLeadItem.id,
      stage: targetStage,
      position: targetPosition,
    });
  }

  function handleDragCancel() {
    setActiveLeadId(null);
  }

  return (
    <div className="min-h-screen bg-[color:var(--bg)] text-[color:var(--text-h)]">
      <div className="mx-auto grid min-h-screen max-w-[1600px] xl:grid-cols-[252px_minmax(0,1fr)]">
        <aside className="hidden border-r border-[color:var(--border)] bg-[color:var(--bg)] px-4 py-5 xl:flex xl:flex-col">
          <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--bg)] p-4 shadow-[var(--shadow)]">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[color:var(--accent-bg)] text-[color:var(--accent)]">
                <span className="text-lg font-semibold">A</span>
              </div>
              <div>
                <div className="text-sm font-semibold text-[color:var(--text-h)]">Alex Rivers</div>
                <div className="text-xs text-[color:var(--text)]">Pro Freelancer</div>
              </div>
            </div>
          </div>

          <button
            type="button"
            className="mt-4 inline-flex items-center justify-center gap-2 rounded-xl bg-[color:var(--accent)] px-4 py-3 text-sm font-semibold text-white shadow-[var(--shadow)] transition hover:opacity-90"
          >
            <span className="text-lg leading-none">+</span>
            New Project
          </button>

          <nav className="mt-8 flex-1 space-y-1">
            {SIDEBAR_ITEMS.map((item) => (
              <button
                key={item.label}
                type="button"
                className={[
                  'flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-medium transition',
                  item.active
                    ? 'bg-[color:var(--accent-bg)] text-[color:var(--text-h)] shadow-sm'
                    : 'text-[color:var(--text)] hover:bg-[color:var(--social-bg)] hover:text-[color:var(--text-h)]',
                ].join(' ')}
              >
                <SidebarIcon icon={item.icon} />
                {item.label}
              </button>
            ))}
          </nav>

          <div className="mt-auto space-y-3 pt-5 text-sm text-[color:var(--text)]">
            <button className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition hover:bg-[color:var(--social-bg)] hover:text-[color:var(--text-h)]">
              <SidebarIcon
                icon={
                  <path
                    d="M5 6h14v12H5zM8 10h8M8 14h5"
                    fill="none"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.6"
                  />
                }
              />
              Settings
            </button>
          </div>
        </aside>

        <main className="flex min-w-0 flex-col px-4 py-5 sm:px-6 lg:px-8">
          <div className="mb-5 flex items-center justify-between gap-4 border-b border-[color:var(--border)] pb-4">
            <div className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl border border-[color:var(--border)] bg-[color:var(--bg)] px-4 py-3 shadow-sm">
              <svg viewBox="0 0 24 24" className="h-5 w-5 text-[color:var(--text)]" aria-hidden="true">
                <path d="M10 18a8 8 0 1 1 5.293-14.01A8 8 0 0 1 10 18Zm7-1 4 4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
              </svg>
              <input
                aria-label="Search clients, projects, or invoices"
                type="search"
                placeholder="Search clients, projects, or invoices..."
                className="w-full border-0 bg-transparent text-sm text-[color:var(--text-h)] outline-none placeholder:text-[color:var(--text)]"
              />
            </div>

            <div className="hidden items-center gap-3 lg:flex">
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-xl border border-[color:var(--border)] bg-[color:var(--bg)] px-4 py-2.5 text-sm font-medium text-[color:var(--text-h)] shadow-sm transition hover:border-[color:var(--accent-border)] hover:bg-[color:var(--social-bg)]"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
                  <path d="M4 6h16M7 12h10M10 18h4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
                </svg>
                Filter
              </button>

              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-xl bg-[color:var(--accent)] px-4 py-2.5 text-sm font-semibold text-white shadow-[var(--shadow)] transition hover:opacity-90"
              >
                <span className="text-lg leading-none">+</span>
                Quick Add
              </button>
            </div>
          </div>

          <div className="mb-6 flex items-end justify-between gap-4">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-[color:var(--text-h)] sm:text-[40px]">
                CRM Pipeline
              </h1>
              <p className="mt-2 text-sm text-[color:var(--text)] sm:text-base">
                Manage active leads and client relationships.
              </p>
            </div>

            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-xl border border-[color:var(--border)] bg-[color:var(--bg)] px-4 py-2.5 text-sm font-medium text-[color:var(--text-h)] shadow-sm transition hover:border-[color:var(--accent-border)] hover:bg-[color:var(--social-bg)]"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
                <path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
              </svg>
              Quick Add
            </button>
          </div>

          <DndContext
            collisionDetection={closestCorners}
            sensors={dragSensors}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
          >
            <div className="grid gap-4 xl:grid-cols-4">
              {PIPELINE_COLUMNS.map((column) => {
                const columnLeads = groupedLeads[column.stage];
                const queryLoading =
                  column.stage === 'new_leads'
                    ? newLeadsQuery.isLoading
                    : column.stage === 'contacted'
                      ? contactedQuery.isLoading
                      : column.stage === 'proposal_sent'
                        ? proposalSentQuery.isLoading
                        : wonQuery.isLoading;

                const isOver = false;

                return (
                  <LeadColumn
                    key={column.stage}
                    title={column.title}
                    stage={column.stage}
                    dotClass={column.dotClass}
                    leads={columnLeads}
                    isOver={isOver}
                    isLoading={allQueryLoading ? queryLoading : false}
                  />
                );
              })}
            </div>

            <DragOverlay dropAnimation={null}>
              {activeLead ? <LeadCard lead={activeLead} overlay /> : null}
            </DragOverlay>
          </DndContext>

          {newLeadsQuery.isError || contactedQuery.isError || proposalSentQuery.isError || wonQuery.isError ? (
            <div className="mt-4 rounded-2xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-100">
              One or more lead queries failed to load.
            </div>
          ) : null}
        </main>
      </div>
    </div>
  );
}