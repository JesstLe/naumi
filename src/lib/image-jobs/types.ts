import type {QueueKind} from '../image-job-queue';
export type ImageJobKind=QueueKind;
export type ImageJobRow={id:string;email:string;kind:ImageJobKind;snapshot:Record<string,unknown>;payload:Record<string,unknown>;lease_token:string|null;billing_settled:boolean};
