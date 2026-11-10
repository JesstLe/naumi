import {z} from "zod";
/** Leaf identity contract; shared schemas must not import the full node/workflow graph. */
export const videoNodeIdSchema=z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/);
