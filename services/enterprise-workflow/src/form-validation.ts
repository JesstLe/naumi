import {WorkflowError} from './contracts';
import type {FormDefinition,FormValues} from './form-contracts';
export type FormIssue={fieldId:string;code:string};
export class FormValidationError extends WorkflowError{constructor(public fields:FormIssue[]){super(400,'FORM_VALUES_INVALID');}}
export function visibleFields(definition:FormDefinition,values:FormValues){const visible=new Map<string,boolean>();for(const f of definition.fields)visible.set(f.id,!f.visibleWhen||visible.get(f.visibleWhen.fieldId)===true&&values[f.visibleWhen.fieldId]===f.visibleWhen.equals);return visible;}
export function checkFormValues(definition:FormDefinition,values:FormValues,required:boolean){
 const issues:FormIssue[]=[],visible=visibleFields(definition,values),known=new Set(definition.fields.map(f=>f.id));
 for(const id of Object.keys(values))if(!known.has(id))issues.push({fieldId:id,code:'UNKNOWN_FIELD'});
 for(const f of definition.fields){const v=values[f.id],blank=v===undefined||v===null||typeof v==='string'&&!v.trim(),add=(code:string)=>issues.push({fieldId:f.id,code});if(blank){if(required&&visible.get(f.id)&&f.required)add('REQUIRED');continue;}
  if(f.type==='boolean'){if(typeof v!=='boolean')add('BOOLEAN_REQUIRED');}
  else if(f.type==='number'){if(typeof v!=='number'||!Number.isFinite(v))add('NUMBER_REQUIRED');else if(f.min!==null&&v<f.min||f.max!==null&&v>f.max)add('OUT_OF_RANGE');}
  else if(typeof v!=='string')add('TEXT_REQUIRED');
  else if(f.type==='select'){if(!f.options.some(o=>o.id===v))add('OPTION_INVALID');}
  else if(f.type==='date'){const d=new Date(v+'T00:00:00Z');if(!/^\d{4}-\d{2}-\d{2}$/.test(v)||Number.isNaN(+d)||d.toISOString().slice(0,10)!==v)add('DATE_INVALID');}
  else if(v.length>f.maxLength)add('TEXT_TOO_LONG');
 }
 return issues;
}
export function validateFormValues(definition:FormDefinition,values:FormValues,required:boolean){const errors=checkFormValues(definition,values,required);if(errors.length)throw new FormValidationError(errors);return values;}
