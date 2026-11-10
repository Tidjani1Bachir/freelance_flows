const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

const DEFAULT_DATABASE_FILE = process.env.SQLITE_PATH || path.resolve(process.cwd(), 'freelanceflow.db');

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  currency TEXT DEFAULT 'USD',
  invoice_prefix TEXT DEFAULT 'INV-',
  tax_rate REAL DEFAULT 0,
  payment_terms TEXT DEFAULT 'Net 15',
  timezone TEXT DEFAULT 'UTC',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT,
  company TEXT,
  notes TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  hourly_rate REAL DEFAULT 0,
  budget REAL,
  status TEXT DEFAULT 'active',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_name TEXT NOT NULL,
  email TEXT,
  project_type TEXT,
  value REAL DEFAULT 0,
  stage TEXT NOT NULL DEFAULT 'new_leads',
  notes TEXT,
  position INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_number TEXT UNIQUE NOT NULL,
  client_id INTEGER REFERENCES clients(id),
  issue_date TEXT NOT NULL,
  due_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  subtotal REAL NOT NULL DEFAULT 0,
  tax_rate REAL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS invoice_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  hours REAL DEFAULT 0,
  rate REAL DEFAULT 0,
  total REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS time_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER REFERENCES projects(id),
  description TEXT,
  start_time TEXT NOT NULL,
  end_time TEXT,
  duration_seconds INTEGER DEFAULT 0,
  billable INTEGER DEFAULT 1,
  amount REAL DEFAULT 0,
  invoiced INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  folder_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL UNIQUE,
  size_bytes INTEGER,
  hash TEXT,
  modified_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_time_entries_project ON time_entries(project_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_leads_stage ON leads(stage);
CREATE INDEX IF NOT EXISTS idx_files_hash ON files(hash);
`;

let database;

function getDatabase() {
  if (database) {
    return database;
  }

  if (DEFAULT_DATABASE_FILE !== ':memory:') {
    fs.mkdirSync(path.dirname(DEFAULT_DATABASE_FILE), { recursive: true });
  }

  database = new Database(DEFAULT_DATABASE_FILE);
  database.pragma('journal_mode = WAL');
  database.pragma('foreign_keys = ON');
  database.pragma('busy_timeout = 5000');
  database.exec(SCHEMA_SQL);

  return database;
}

const invoiceStatement = getDatabase().prepare(`
  SELECT
    i.id,
    i.invoice_number,
    i.client_id,
    i.issue_date,
    i.due_date,
    i.status,
    i.subtotal,
    i.tax_rate,
    i.total,
    i.notes,
    i.created_at,
    c.name AS client_name,
    c.email AS client_email,
    c.company AS client_company,
    c.notes AS client_notes
  FROM invoices i
  LEFT JOIN clients c ON c.id = i.client_id
  WHERE i.id = ?
`);

const invoiceItemsStatement = getDatabase().prepare(`
  SELECT
    id,
    invoice_id,
    description,
    hours,
    rate,
    total
  FROM invoice_items
  WHERE invoice_id = ?
  ORDER BY id ASC
`);

function getInvoiceExportData(invoiceId) {
  const invoice = invoiceStatement.get(invoiceId);

  if (!invoice) {
    return null;
  }

  return {
    invoice: {
      id: invoice.id,
      invoiceNumber: invoice.invoice_number,
      clientId: invoice.client_id,
      issueDate: invoice.issue_date,
      dueDate: invoice.due_date,
      status: invoice.status,
      subtotal: Number(invoice.subtotal ?? 0),
      taxRate: Number(invoice.tax_rate ?? 0),
      total: Number(invoice.total ?? 0),
      notes: invoice.notes,
      createdAt: invoice.created_at,
    },
    client: {
      id: invoice.client_id,
      name: invoice.client_name,
      email: invoice.client_email,
      company: invoice.client_company,
      notes: invoice.client_notes,
    },
    items: invoiceItemsStatement.all(invoiceId).map((item) => ({
      id: item.id,
      invoiceId: item.invoice_id,
      description: item.description,
      hours: Number(item.hours ?? 0),
      rate: Number(item.rate ?? 0),
      total: Number(item.total ?? 0),
    })),
  };
}

module.exports = {
  getInvoiceExportData,
};