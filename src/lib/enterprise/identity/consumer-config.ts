import {z} from 'zod';
export const consumersSchema=z.array(z.object({productId:z.literal('design-ops'),enterpriseId:z.string().uuid(),tokenSha256:z.string().regex(/^[a-f0-9]{64}$/)}).strict()).max(50).refine(entries=>new Set(entries.map(e=>e.tokenSha256)).size===entries.length&&new Set(entries.map(e=>`${e.enterpriseId}:${e.productId}`)).size===entries.length);
