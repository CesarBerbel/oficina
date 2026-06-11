import { z } from 'zod';
import { paginationQuerySchema } from './common.js';

export const listAuditQuerySchema = paginationQuerySchema.extend({
  module: z.string().max(40).optional(),
  action: z.string().max(40).optional(),
});
export type ListAuditQuery = z.infer<typeof listAuditQuerySchema>;

export interface AuditLogDto {
  id: string;
  action: string;
  module: string;
  entity: string;
  entityId: string | null;
  userName: string | null;
  ip: string | null;
  before: unknown;
  after: unknown;
  createdAt: string;
}
