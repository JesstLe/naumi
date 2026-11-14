import type {VideoExecutionIntent,VideoExecutionDraft} from './execution-contract';

/** Public presentation of Profile.describe, not a second execution validator.
 * No wire field, endpoint, credential, storage identity or model-name rule. */
export type VideoUiParameter={type:'string'|'number'|'integer'|'boolean'|'json';required?:boolean;default?:VideoExecutionDraft['parameters'][string];
  values?:Array<string|number|boolean|null>;minimum?:number;maximum?:number};
export type VideoUiContract={version:1;modelVersion:number;modelDigest:string;policyRevision:number;
  defaults:{ordinaryImage?:'single_image'|'reference';sourceVideo?:'video_edit'|'reference'};
  operations:Array<{intent:VideoExecutionIntent;structure?:{shots?:{min?:number;max?:number;maxPromptChars?:number;minDurationSeconds?:number;durationStep?:number};elements?:{min?:number;max?:number;media:Array<{kinds:Array<'image'|'video'|'audio'>;min?:number;max?:number}>}};parameters:Record<string,VideoUiParameter>}>};
