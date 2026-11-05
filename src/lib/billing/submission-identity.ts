import {createHash} from "node:crypto";

export type SubmissionField=[string,string|{name:string;type:string;size:number;sha256:string}];

/** WHATWG multipart serialization normalizes field text to CRLF before parsing. */
export function multipartFieldText(value:string){return value.replace(/\r\n|\r|\n/g,"\r\n");}

/** Matches the existing multipart receipt identity, independent of HTTP serialization. */
export function submissionFingerprint(path:string,imageQuality:string|null,textModel:string|null,featureModel:string|null,entries:unknown[]){
  return createHash("sha256").update(JSON.stringify([path,imageQuality,textModel,featureModel,entries])).digest("hex");
}

export function multipartSubmissionFields(fields:SubmissionField[]){
  return fields.filter(([key])=>key!=="billingVersion"&&key!=="billingCredits").slice().sort(([a],[b])=>a.localeCompare(b));
}
