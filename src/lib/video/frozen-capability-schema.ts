// Pure validation must not enter the db -> billing -> execution module cycle.
import {z} from 'zod';
import {videoDefinitionSchema,videoWireProfileSchema} from './capability-schema';
export const frozenVideoSchema=z.strictObject({definition:videoDefinitionSchema,
  sources:z.record(z.string(),z.enum(["admin","vendor","adapter","unknown"])),profile:videoWireProfileSchema.optional(),
  sourceRevision:z.strictObject({id:z.string().uuid(),revision:z.number().int().positive(),sourceUrl:z.string().max(1500),collectedAt:z.string().max(100)}).optional()});
export type FrozenVideoCapability=z.infer<typeof frozenVideoSchema>;
