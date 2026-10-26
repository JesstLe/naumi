import {z} from "zod";
export const videoProjectKeySchema=z.string().regex(/^(?:tree|batch):[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/);
