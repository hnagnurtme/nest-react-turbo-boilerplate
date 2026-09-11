import { z } from 'zod';
import { UUID_REGEX } from '../../../common/constants';

export const switchTenantSchema = z.object({
  tenantId: z.string().regex(UUID_REGEX),
});

export type SwitchTenantDto = z.infer<typeof switchTenantSchema>;
