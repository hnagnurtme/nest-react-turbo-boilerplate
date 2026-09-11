import { z } from 'zod';
import { ITEM_STATUSES } from '../../../core/database/schema';

export const updateItemSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(2000).optional(),
    status: z.enum(ITEM_STATUSES).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'At least one field must be provided' });

export type UpdateItemDto = z.infer<typeof updateItemSchema>;
