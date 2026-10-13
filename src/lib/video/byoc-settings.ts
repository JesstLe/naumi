import {z} from "zod";
import type {WorkflowInputs} from "../comfyui/workflow";
import type {VideoWorkflowManifest} from "./workflow-schema";
const id=z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/),number=z.number().finite().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const videoByocOverridesSchema=z.strictObject({texts:z.record(id,z.string().max(16384)).optional(),seeds:z.record(id,number.int()).optional(),numerics:z.record(id,z.record(id,number)).optional()});
export type VideoByocOverrides=z.infer<typeof videoByocOverridesSchema>;
export type VideoByocWorkflow={id:string;name:string;videoOutput:boolean;inputs:WorkflowInputs;paths:{nodeId:string;field:string;label:string}[];defaultMappings:VideoWorkflowManifest["inputs"]};
export type VideoByocCatalog={endpoint:{id:string;name:string}|null;workflows:VideoByocWorkflow[]};
