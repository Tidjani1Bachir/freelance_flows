import {
  createDatabase,
  type CreateLeadInput,
  type LeadRow,
  type LeadStage,
  type UpdateLeadInput,
} from './index';

export interface ListLeadsParams {
  page: number;
  limit: number;
  stage?: LeadStage;
}

export interface LeadListResult {
  items: LeadRow[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

const database = createDatabase();

const countLeadsByStageStatement = database.prepare<{ total: number }>(`
  SELECT COUNT(*) AS total
  FROM leads
  WHERE (? IS NULL OR stage = ?)
`);

const listLeadsStatement = database.prepare<LeadRow>(`
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
  WHERE (? IS NULL OR stage = ?)
  ORDER BY position ASC, updated_at DESC, id DESC
  LIMIT ? OFFSET ?
`);

const selectLeadByIdStatement = database.prepare<LeadRow>(`
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

const insertLeadStatement = database.prepare<LeadRow>(`
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

const updateLeadStatement = database.prepare<LeadRow>(`
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

const updateLeadStageStatement = database.prepare<LeadRow>(`
  UPDATE leads
  SET
    stage = ?,
    position = ?,
    updated_at = CURRENT_TIMESTAMP
  WHERE id = ?
`);

const deleteLeadStatement = database.prepare<LeadRow>(`
  DELETE FROM leads
  WHERE id = ?
`);

export function listLeads(params: ListLeadsParams): LeadListResult {
  const { page, limit, stage } = params;
  const offset = (page - 1) * limit;
  const stageFilter = stage ?? null;

  const totalRow = countLeadsByStageStatement.get(stageFilter, stageFilter);
  const total = totalRow?.total ?? 0;

  return {
    items: listLeadsStatement.all(stageFilter, stageFilter, limit, offset),
    page,
    limit,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / limit),
  };
}

export function getLeadById(id: number): LeadRow | undefined {
  return selectLeadByIdStatement.get(id);
}

export function createLead(input: CreateLeadInput): LeadRow {
  const result = insertLeadStatement.run(
    input.client_name,
    input.email ?? null,
    input.project_type ?? null,
    input.value ?? 0,
    input.stage ?? 'new_leads',
    input.notes ?? null,
    input.position ?? 0,
  );

  const lead = selectLeadByIdStatement.get(Number(result.lastInsertRowid));

  if (!lead) {
    throw new Error('Failed to load created lead');
  }

  return lead;
}

export function updateLead(id: number, input: UpdateLeadInput): LeadRow | undefined {
  const result = updateLeadStatement.run(
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

  return selectLeadByIdStatement.get(id);
}

export function updateLeadStage(id: number, stage: LeadStage, position: number): LeadRow | undefined {
  const result = updateLeadStageStatement.run(stage, position, id);

  if (result.changes === 0) {
    return undefined;
  }

  return selectLeadByIdStatement.get(id);
}

export function deleteLead(id: number): boolean {
  const result = deleteLeadStatement.run(id);
  return result.changes > 0;
}
