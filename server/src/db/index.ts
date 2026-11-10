import * as fs from 'node:fs';
import * as path from 'node:path';

type SqliteRunResult = {
  changes: number;
  lastInsertRowid: number | bigint;
};

type PreparedStatement<TResult> = {
  run(...params: unknown[]): SqliteRunResult;
  get(...params: unknown[]): TResult | undefined;
  all(...params: unknown[]): TResult[];
};

type BetterSqlite3Constructor = new (
  databaseFile: string,
  options?: {
    readonly?: boolean;
    fileMustExist?: boolean;
  },
) => BetterSqliteDatabase;

export type BetterSqliteDatabase = {
  pragma(statement: string, value?: unknown): unknown;
  exec(sql: string): void;
  prepare<TResult = unknown>(sql: string): PreparedStatement<TResult>;
  close(): void;
};

export type LeadStage = 'new_leads' | 'contacted' | 'proposal_sent' | 'won' | 'lost';

export interface LeadRow {
  id: number;
  client_name: string;
  email: string | null;
  project_type: string | null;
  value: number;
  stage: LeadStage;
  notes: string | null;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface CreateLeadInput {
  client_name: string;
  email?: string | null;
  project_type?: string | null;
  value?: number;
  stage?: LeadStage;
  notes?: string | null;
  position?: number;
}

export interface UpdateLeadInput {
  client_name: string;
  email: string | null;
  project_type: string | null;
  value: number;
  stage: LeadStage;
  notes: string | null;
  position: number;
}

export interface LeadRepository {
  all(): LeadRow[];
  findById(id: number): LeadRow | undefined;
  create(input: CreateLeadInput): LeadRow;
  update(id: number, input: UpdateLeadInput): LeadRow | undefined;
  updateStage(id: number, stage: LeadStage): LeadRow | undefined;
  remove(id: number): boolean;
}

const Database = require('better-sqlite3') as BetterSqlite3Constructor;

const DEFAULT_DATABASE_FILE = process.env.SQLITE_PATH ?? path.resolve(process.cwd(), 'freelanceflow.db');

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  language TEXT DEFAULT 'English',
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

function resolveDatabaseFile(databaseFile: string): string {
  return databaseFile === ':memory:' ? databaseFile : path.resolve(databaseFile);
}

function createDatabase(databaseFile: string = DEFAULT_DATABASE_FILE): BetterSqliteDatabase {
  const resolvedDatabaseFile = resolveDatabaseFile(databaseFile);

  if (resolvedDatabaseFile !== ':memory:') {
    fs.mkdirSync(path.dirname(resolvedDatabaseFile), { recursive: true });
  }

  const database = new Database(resolvedDatabaseFile);

  database.pragma('journal_mode = WAL');
  database.pragma('foreign_keys = ON');
  database.pragma('busy_timeout = 5000');

  initializeSchema(database);

  return database;
}

function initializeSchema(database: BetterSqliteDatabase): void {
  database.exec(SCHEMA_SQL);
}

function createLeadRepository(database: BetterSqliteDatabase): LeadRepository {
  const selectAllStatement = database.prepare<LeadRow>(`
    SELECT
      id,
      client_name,
      email,
      project_type,
      value,
      stage,
      notes,
      position,
      created_at,
      updated_at
    FROM leads
    ORDER BY position ASC, updated_at DESC, id DESC
  `);

  const selectByIdStatement = database.prepare<LeadRow>(`
    SELECT
      id,
      client_name,
      email,
      project_type,
      value,
      stage,
      notes,
      position,
      created_at,
      updated_at
    FROM leads
    WHERE id = ?
  `);

  const insertStatement = database.prepare<LeadRow>(`
    INSERT INTO leads (
      client_name,
      email,
      project_type,
      value,
      stage,
      notes,
      position
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const updateStatement = database.prepare<LeadRow>(`
    UPDATE leads
    SET
      client_name = ?,
      email = ?,
      project_type = ?,
      value = ?,
      stage = ?,
      notes = ?,
      position = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);

  const updateStageStatement = database.prepare<LeadRow>(`
    UPDATE leads
    SET stage = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);

  const deleteStatement = database.prepare<LeadRow>(`
    DELETE FROM leads
    WHERE id = ?
  `);

  return {
    all(): LeadRow[] {
      return selectAllStatement.all();
    },

    findById(id: number): LeadRow | undefined {
      return selectByIdStatement.get(id);
    },

    create(input: CreateLeadInput): LeadRow {
      const result = insertStatement.run(
        input.client_name,
        input.email ?? null,
        input.project_type ?? null,
        input.value ?? 0,
        input.stage ?? 'new_leads',
        input.notes ?? null,
        input.position ?? 0,
      );

      const createdLead = selectByIdStatement.get(Number(result.lastInsertRowid));

      if (!createdLead) {
        throw new Error('Failed to read back inserted lead');
      }

      return createdLead;
    },

    update(id: number, input: UpdateLeadInput): LeadRow | undefined {
      const result = updateStatement.run(
        input.client_name,
        input.email,
        input.project_type,
        input.value,
        input.stage,
        input.notes,
        input.position,
        id,
      );

      if (result.changes === 0) {
        return undefined;
      }

      return selectByIdStatement.get(id);
    },

    updateStage(id: number, stage: LeadStage): LeadRow | undefined {
      const result = updateStageStatement.run(stage, id);

      if (result.changes === 0) {
        return undefined;
      }

      return selectByIdStatement.get(id);
    },

    remove(id: number): boolean {
      const result = deleteStatement.run(id);
      return result.changes > 0;
    },
  };
}

export {
  createDatabase,
  createLeadRepository,
  initializeSchema,
};