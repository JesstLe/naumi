import {ModelConfigError} from './types';
const local=new WeakMap<Response,ModelConfigError>();
export function localImageRejectionResponse(error:ModelConfigError){
 const response=Response.json({error:{message:error.message,code:error.code,type:'naumi_local_image_config',...(error.code!=='OPERATION_CONFLICT'?{billing_status:'not_charged'}:{})}},{status:error.status});
 // A conflict may refer to an accepted paid operation; do not turn it into a
 // definite local pre-submission rejection or change the unknown-receipt path.
 if(error.code!=='OPERATION_CONFLICT')local.set(response,error);return response;
}
export const localImageRejection=(response:Response)=>local.get(response);
