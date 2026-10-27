import "server-only";
import { DurableImageJobs } from "@/lib/image-jobs/runtime";
import type {getUser} from "@/lib/accounts/session";
import type {GeneratedImage} from "./generation-types";
import type {TaskFailureDiagnostic} from "./task-diagnostics";
/** Persistence owner shared by submit/read/runtime; reading does not import provider execution. */
type Job = {
  status: "pending" | "done" | "error" | "needs_attention";
  images?: GeneratedImage[];
  user?: Awaited<ReturnType<typeof getUser>>;
  creditsUsed?: number;
  mock?: boolean;
  mode?: string;
  persisted?: boolean;
  deliveryComplete?:boolean;
  billingStatus?:"confirmed"|"unavailable";
  error?: string;
  imagegenOutputError?:string;
  imagegenOutputWarning?:string;
  deliveryAttempts?:number;
  failureDiagnostic?:TaskFailureDiagnostic;
  deliveryFailure?:{stage:string;name:string;code:string};
  createdAt: number;
  sourceUrl?: string | null;
  /** 质量审计:请求档 vs 实际执行档与回退原因(通道不支持时回退默认档)。 */
  quality?: { requested: string; executed: string; fallbackReason: string | null; executedQualities?: string[] };
};

export const JOBS = new DurableImageJobs<Job>("generate");
