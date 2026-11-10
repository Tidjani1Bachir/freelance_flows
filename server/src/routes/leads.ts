import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import {
  createLead,
  deleteLead,
  listLeads,
  updateLead,
  updateLeadStage,
} from '../db/leads';

const leadStageSchema = z.enum(['new_leads', 'contacted', 'proposal_sent', 'won', 'lost']);

const positiveIntSchema = z.coerce.number().int().positive();

const listLeadsQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
    stage: leadStageSchema.optional(),
  })
  .strict();

const createLeadBodySchema = z
  .object({
    client_name: z.string().trim().min(1),
    email: z.string().trim().email().nullable().optional(),
    project_type: z.string().trim().min(1).nullable().optional(),
    value: z.coerce.number().finite().nonnegative().optional(),
    stage: leadStageSchema.optional(),
    notes: z.string().nullable().optional(),
    position: z.coerce.number().int().nonnegative().optional(),
  })
  .strict();

const updateLeadBodySchema = z
  .object({
    client_name: z.string().trim().min(1),
    email: z.string().trim().email().nullable(),
    project_type: z.string().trim().min(1).nullable(),
    value: z.coerce.number().finite().nonnegative(),
    stage: leadStageSchema,
    notes: z.string().nullable(),
    position: z.coerce.number().int().nonnegative(),
  })
  .strict();

const updateLeadStageBodySchema = z
  .object({
    stage: leadStageSchema,
    position: z.coerce.number().int().nonnegative(),
  })
  .strict();

const router = Router();

function sendValidationError(res: Response, message: string) {
  return res.status(400).json({
    error: {
      code: 'VALIDATION_ERROR',
      message,
    },
  });
}

function sendNotFound(res: Response, message = 'Lead not found') {
  return res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message,
    },
  });
}

function parsePositiveLeadId(req: Request, res: Response): number | null {
  const parsedId = positiveIntSchema.safeParse(req.params.id);

  if (!parsedId.success) {
    sendValidationError(res, 'id must be a positive integer');
    return null;
  }

  return parsedId.data;
}

router.get('/leads', (req, res) => {
  const parsedQuery = listLeadsQuerySchema.safeParse(req.query);

  if (!parsedQuery.success) {
    return sendValidationError(res, 'Invalid pagination or filter parameters');
  }

  const { page, limit, stage } = parsedQuery.data;
  const result = listLeads({ page, limit, stage });

  return res.status(200).json(result);
});

router.post('/leads', (req, res) => {
  const parsedBody = createLeadBodySchema.safeParse(req.body);

  if (!parsedBody.success) {
    return sendValidationError(res, 'Invalid lead payload');
  }

  const lead = createLead(parsedBody.data);
  return res.status(201).json(lead);
});

router.patch('/leads/:id/stage', (req, res) => {
  const id = parsePositiveLeadId(req, res);

  if (id === null) {
    return;
  }

  const parsedBody = updateLeadStageBodySchema.safeParse(req.body);

  if (!parsedBody.success) {
    return sendValidationError(res, 'Invalid stage update payload');
  }

  const lead = updateLeadStage(id, parsedBody.data.stage, parsedBody.data.position);

  if (!lead) {
    return sendNotFound(res);
  }

  return res.status(200).json(lead);
});

router.put('/leads/:id', (req, res) => {
  const id = parsePositiveLeadId(req, res);

  if (id === null) {
    return;
  }

  const parsedBody = updateLeadBodySchema.safeParse(req.body);

  if (!parsedBody.success) {
    return sendValidationError(res, 'Invalid lead update payload');
  }

  const lead = updateLead(id, parsedBody.data);

  if (!lead) {
    return sendNotFound(res);
  }

  return res.status(200).json(lead);
});

router.delete('/leads/:id', (req, res) => {
  const id = parsePositiveLeadId(req, res);

  if (id === null) {
    return;
  }

  const removed = deleteLead(id);

  if (!removed) {
    return sendNotFound(res);
  }

  return res.status(204).send();
});

export { router as leadsRouter };
export default router;