export class SourceAuditError extends Error {}
export function sourceSite(raw: unknown): {version:1;adminUrl:string;origin:string;enterpriseId:string;expectedEnterpriseName:string};
export function inspectSource(pool: {connect():Promise<{query(sql:string,values?:any[]):Promise<{rows:any[]}>;release():void}>},site: unknown,env?: Record<string,string|undefined>): Promise<{summary:Record<string,any>;roster:{rows:Array<{sourceSubject:string;alias:string;accountAvailable:boolean}>}} >;
