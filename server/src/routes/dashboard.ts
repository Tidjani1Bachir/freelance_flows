const path = require('node:path');
const { createDatabase } = require('../db/index.ts');

const router = require('express').Router();

function formatCurrency(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function formatHours(value) {
  return `${Number(value || 0).toFixed(1)}h`;
}

function formatFileSize(bytes) {
  const safeBytes = Number(bytes || 0);

  if (safeBytes < 1024) {
    return `${safeBytes} B`;
  }

  const kilobytes = safeBytes / 1024;

  if (kilobytes < 1024) {
    return `${kilobytes.toFixed(kilobytes >= 10 ? 0 : 1)} KB`;
  }

  const megabytes = kilobytes / 1024;
  return `${megabytes.toFixed(megabytes >= 10 ? 0 : 1)} MB`;
}

function formatRelativeMeta(createdAt, modifiedAt) {
  const rawValue = modifiedAt || createdAt;
  if (!rawValue) {
    return 'Recently added';
  }

  const dateValue = new Date(rawValue);
  if (Number.isNaN(dateValue.getTime())) {
    return 'Recently added';
  }

  const now = Date.now();
  const diffMs = Math.max(0, now - dateValue.getTime());
  const diffMinutes = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMinutes < 60) {
    return `${Math.max(diffMinutes, 1)} min ago`;
  }

  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }

  if (diffDays === 1) {
    return 'Yesterday';
  }

  return `${diffDays} days ago`;
}

function formatMonthLabel(dateString) {
  const dateValue = new Date(`${dateString}-01T00:00:00`);

  if (Number.isNaN(dateValue.getTime())) {
    return dateString;
  }

  return dateValue.toLocaleDateString('en-US', { month: 'short' });
}

function toTitleCase(value) {
  return String(value || '')
    .split(/[_-]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

function monthKeyFromOffset(offset) {
  const dateValue = new Date();
  dateValue.setDate(1);
  dateValue.setMonth(dateValue.getMonth() + offset);

  const year = dateValue.getFullYear();
  const month = String(dateValue.getMonth() + 1).padStart(2, '0');

  return `${year}-${month}`;
}

function iconForFile(fileName) {
  const extension = path.extname(fileName).toLowerCase();

  if (extension === '.pdf') {
    return 'pdf';
  }

  if (extension === '.zip' || extension === '.rar' || extension === '.7z') {
    return 'zip';
  }

  if (extension === '.doc' || extension === '.docx') {
    return 'doc';
  }

  return 'file';
}

function sumBy(rows, selector) {
  return rows.reduce((total, row) => total + Number(selector(row) || 0), 0);
}

function buildDashboardSummary() {
  const database = createDatabase();

  const transaction = database.transaction(() => {
    const [users, todayBillableRow, monthBillableRow, previousMonthBillableRow, activeSessionRow, pipelineRows, recentInvoices, recentFiles, incomeByMonthRows, expenseByMonthRows] = [
        database
          .prepare(
            `
              SELECT name, email, language, timezone
              FROM users
              ORDER BY id ASC
              LIMIT 1
            `,
          )
          .all(),
        database
          .prepare(
            `
              SELECT
                COALESCE(SUM(duration_seconds), 0) AS durationSeconds,
                COALESCE(SUM(amount), 0) AS amount
              FROM time_entries
              WHERE billable = 1
                AND date(start_time, 'localtime') = date('now', 'localtime')
            `,
          )
          .get(),
        database
          .prepare(
            `
              SELECT
                COALESCE(SUM(duration_seconds), 0) AS durationSeconds,
                COALESCE(SUM(amount), 0) AS amount
              FROM time_entries
              WHERE billable = 1
                AND date(start_time, 'localtime') >= date('now', 'localtime', 'start of month')
                AND date(start_time, 'localtime') < date('now', 'localtime', 'start of month', '+1 month')
            `,
          )
          .get(),
        database
          .prepare(
            `
              SELECT
                COALESCE(SUM(duration_seconds), 0) AS durationSeconds,
                COALESCE(SUM(amount), 0) AS amount
              FROM time_entries
              WHERE billable = 1
                AND date(start_time, 'localtime') >= date('now', 'localtime', 'start of month', '-1 month')
                AND date(start_time, 'localtime') < date('now', 'localtime', 'start of month')
            `,
          )
          .get(),
        database
          .prepare(
            `
              SELECT
                t.id,
                t.project_id,
                t.description,
                t.start_time,
                t.duration_seconds,
                t.billable,
                t.amount,
                p.name AS project_name
              FROM time_entries t
              LEFT JOIN projects p ON p.id = t.project_id
              WHERE t.end_time IS NULL
              ORDER BY datetime(t.start_time) DESC, t.id DESC
              LIMIT 1
            `,
          )
          .get(),
        database
          .prepare(
            `
              SELECT stage, COUNT(*) AS count
              FROM leads
              GROUP BY stage
            `,
          )
          .all(),
        database
          .prepare(
            `
              SELECT
                i.id,
                i.invoice_number,
                i.status,
                i.total,
                i.due_date,
                i.issue_date,
                i.created_at,
                c.name AS client_name
              FROM invoices i
              LEFT JOIN clients c ON c.id = i.client_id
              ORDER BY datetime(i.created_at) DESC, i.id DESC
              LIMIT 3
            `,
          )
          .all(),
        database
          .prepare(
            `
              SELECT id, folder_path, file_name, file_path, size_bytes, modified_at, created_at
              FROM files
              ORDER BY datetime(COALESCE(modified_at, created_at)) DESC, id DESC
              LIMIT 3
            `,
          )
          .all(),
        database
          .prepare(
            `
              SELECT strftime('%Y-%m', issue_date) AS monthKey, COALESCE(SUM(total), 0) AS income
              FROM invoices
              GROUP BY monthKey
              ORDER BY monthKey ASC
              LIMIT 6
            `,
          )
          .all(),
        database
          .prepare(
            `
              SELECT strftime('%Y-%m', start_time) AS monthKey, COALESCE(SUM(amount), 0) AS expenses
              FROM time_entries
              WHERE billable = 0
              GROUP BY monthKey
              ORDER BY monthKey ASC
              LIMIT 6
            `,
          )
          .all(),
      ];

      const userRow = users[0] || null;
      const userName = userRow?.name || 'Alex Rivers';

      const pipelineCounts = new Map(pipelineRows.map((row) => [row.stage, Number(row.count || 0)]));
      const pendingQuotesCount = Number(pipelineCounts.get('contacted') || 0) + Number(pipelineCounts.get('proposal_sent') || 0);
      const monthIncomeMap = new Map(incomeByMonthRows.map((row) => [row.monthKey, Number(row.income || 0)]));
      const monthExpenseMap = new Map(expenseByMonthRows.map((row) => [row.monthKey, Number(row.expenses || 0)]));

      const currentMonthIncome = Number(monthBillableRow?.amount || 0);
      const previousMonthIncome = Number(previousMonthBillableRow?.amount || 0);
      const currentMonthHours = Number(monthBillableRow?.durationSeconds || 0) / 3600;
      const previousMonthHours = Number(previousMonthBillableRow?.durationSeconds || 0) / 3600;
      const currentMonthExpenses = Number(monthExpenseMap.get(monthKeyFromOffset(0)) || 0);
      const previousMonthExpenses = Number(monthExpenseMap.get(monthKeyFromOffset(-1)) || 0);
      const currentNetProfit = currentMonthIncome - currentMonthExpenses;
      const previousNetProfit = previousMonthIncome - previousMonthExpenses;

      const summaryCards = [
        {
          label: 'Billable Hours Today',
          value: Number(todayBillableRow?.durationSeconds || 0) / 3600,
          formattedValue: formatHours(Number(todayBillableRow?.durationSeconds || 0) / 3600),
          trend: {
            direction: currentMonthHours >= previousMonthHours ? 'up' : 'down',
            value: `${Math.abs(currentMonthHours - previousMonthHours).toFixed(1)}h vs last month`,
            tone: currentMonthHours >= previousMonthHours ? 'positive' : 'negative',
          },
          icon: 'clock',
        },
        {
          label: 'Pending Quotes',
          value: pendingQuotesCount,
          formattedValue: String(pendingQuotesCount),
          trend: {
            direction: pendingQuotesCount > 0 ? 'flat' : 'down',
            value: `${pipelineCounts.get('proposal_sent') || 0} proposals sent`,
            tone: pendingQuotesCount > 0 ? 'neutral' : 'positive',
          },
          icon: 'quote',
        },
        {
          label: 'Net Profit This Month',
          value: currentNetProfit,
          formattedValue: formatCurrency(currentNetProfit),
          trend: {
            direction: currentNetProfit >= previousNetProfit ? 'up' : 'down',
            value: `${formatCurrency(Math.abs(currentNetProfit - previousNetProfit))} vs last month`,
            tone: currentNetProfit >= previousNetProfit ? 'positive' : 'negative',
          },
          icon: 'profit',
        },
      ];
      const monthKeys = [-5, -4, -3, -2, -1, 0].map((offset) => monthKeyFromOffset(offset));

      const incomeVsExpenses = monthKeys.map((monthKey) => ({
        label: formatMonthLabel(monthKey),
        income: monthIncomeMap.get(monthKey) || 0,
        expenses: monthExpenseMap.get(monthKey) || 0,
      }));

      const dealPipeline = [
        { label: 'New Leads', count: Number(pipelineCounts.get('new_leads') || 0) },
        { label: 'Proposal Sent', count: Number(pipelineCounts.get('proposal_sent') || 0) },
        { label: 'Won', count: Number(pipelineCounts.get('won') || 0) },
      ];

      const recentInvoicesPayload = recentInvoices.map((invoice) => ({
        id: invoice.id,
        client: invoice.client_name || 'Unknown Client',
        amount: Number(invoice.total || 0),
        date: invoice.due_date || invoice.issue_date,
        status: toTitleCase(invoice.status),
      }));

      const recentFilesPayload = recentFiles.map((file) => ({
        id: file.id,
        name: file.file_name,
        meta: `${formatFileSize(file.size_bytes)} • ${formatRelativeMeta(file.created_at, file.modified_at)}`,
        size: formatFileSize(file.size_bytes),
        icon: iconForFile(file.file_name),
      }));

      return {
        userName,
        greeting: 'Welcome back',
        summaryCards,
        activeSession: activeSessionRow
          ? {
              isRunning: true,
              projectName: activeSessionRow.project_name || 'Active Project',
              startedAt: activeSessionRow.start_time,
              durationSeconds: Number(activeSessionRow.duration_seconds || 0),
              dailyTotal: Number(todayBillableRow?.amount || 0),
            }
          : {
              isRunning: false,
              projectName: 'No active session',
              startedAt: new Date().toISOString(),
              durationSeconds: 0,
              dailyTotal: Number(todayBillableRow?.amount || 0),
            },
        incomeVsExpenses,
        dealPipeline,
        recentInvoices: recentInvoicesPayload,
        recentFiles: recentFilesPayload,
        databaseFile: path.resolve(process.env.SQLITE_PATH || path.resolve(process.cwd(), 'freelanceflow.db')),
        dashboardMeta: {
          currentMonthIncome,
          currentMonthExpenses,
          pendingQuotesCount,
        },
      };
  });

  return transaction();
}

router.get('/dashboard/summary', (req, res, next) => {
  try {
    return res.status(200).json(buildDashboardSummary());
  } catch (error) {
    return next(error);
  }
});

module.exports = router;