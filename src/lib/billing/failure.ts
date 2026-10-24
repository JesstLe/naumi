import {BillingError} from "./types";
import {ModelConfigError} from "../model-config/types";

/** Transport-neutral error projection shared by HTTP and trusted typed callers. */
export function billingFailure(error: unknown): {status:number;error:string;code?:string;accepted?:false} {
    if (error instanceof ModelConfigError)
        return {status:error.status,error:error.message,code:error.code,...(error.code==="IMAGE_QUOTE_EXPIRED"?{accepted:false as const}:{})};
    if (error instanceof BillingError)
        return {status:error.status,error:error.message,code:error.code};
    return {status:503,error:"计费服务暂时不可用，请稍后重试"};
}
