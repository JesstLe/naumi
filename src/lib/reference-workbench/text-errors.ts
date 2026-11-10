import {createHash,randomUUID} from "node:crypto";
import {ModelConfigError} from "../model-config/types";

/** Closed customer vocabulary; never serialize SDK messages, URLs, headers,
 * request images or supplier response bodies into user-visible errors. */
export function workbenchTextFailure(error:unknown,started:boolean) {
 const value=error&&typeof error==="object"?error as {status?:number;code?:unknown;name?:string;stack?:string}:undefined;
 const status=Number(value?.status),local=error instanceof ModelConfigError;
 let code="TEXT_PREPARE_FAILED",message="提示词推理准备失败，请重新读取图片",httpStatus=500;
 if(local){code="TEXT_MODEL_UNAVAILABLE";message="提示词识图模型暂不可用，请检查文字识图配置";httpStatus=Number.isInteger(status)?status:503;}
 else if([400,422].includes(status)){code="TEXT_INPUT_REJECTED";message="提示词推理请求未被接受，请检查图片和模型参数";httpStatus=status;}
 else if([401,403].includes(status)){code="TEXT_SERVICE_AUTH";message="提示词识图服务认证异常，请联系管理员";httpStatus=status;}
 else if(status===404){code="TEXT_MODEL_UNAVAILABLE";message="提示词识图服务暂不可用，请检查文字识图配置";httpStatus=404;}
 else if(status===429){code="TEXT_SERVICE_BUSY";message="提示词识图服务繁忙，请稍后再操作";httpStatus=429;}
 else if(started){code="OPERATION_PENDING";message="提示词推理结果待核查，请查询原任务，勿重复提交";httpStatus=409;}
 const traceId="wb-"+randomUUID().replaceAll("-","").slice(0,16);
 const signature=createHash("sha256").update(typeof value?.stack==="string"?value.stack:typeof error).digest("hex").slice(0,24);
 console.error("reference-workbench.text-failure",{traceId,code,status:httpStatus,upstreamStatus:Number.isInteger(status)&&status>=100&&status<=599?status:null,signature});
 return {status:httpStatus,body:{error:message,code,traceId}};
}
