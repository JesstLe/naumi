import {z} from 'zod';
import {calendarDate,WorkflowError} from './contracts';
const minutes=z.number().int().min(0).max(1440).multipleOf(15);
export const calendarConfigSchema=z.strictObject({timezone:z.literal('Asia/Shanghai'),weeklyMinutes:z.array(minutes).length(7),overrides:z.array(z.strictObject({date:calendarDate,minutes,label:z.string().trim().min(1).max(80)})).max(366)}).refine(c=>new Set(c.overrides.map(x=>x.date)).size===c.overrides.length,'DUPLICATE_CALENDAR_DATE');
export type CalendarConfig=z.infer<typeof calendarConfigSchema>;
export type TeamCalendar={revision:number;configured:boolean;config:CalendarConfig};
export const legacyCalendar=():TeamCalendar=>({revision:0,configured:false,config:{timezone:'Asia/Shanghai',weeklyMinutes:Array(7).fill(480),overrides:[]}});
export function calendarDays(start:string,end:string){const a=Date.parse(start+'T00:00:00Z'),b=Date.parse(end+'T00:00:00Z'),n=(b-a)/86400000+1;if(!Number.isInteger(n)||n<1||n>366)throw new WorkflowError(400,'INVALID_PLAN_RANGE');return Array.from({length:n},(_,i)=>new Date(a+i*86400000).toISOString().slice(0,10));}
export function dayMinutes(c:CalendarConfig,day:string){return c.overrides.find(x=>x.date===day)?.minutes??c.weeklyMinutes[(new Date(day+'T00:00:00Z').getUTCDay()+6)%7];}
export function minuteReader(c:CalendarConfig){const overrides=new Map(c.overrides.map(x=>[x.date,x.minutes]));return (day:string)=>overrides.get(day)??c.weeklyMinutes[(new Date(day+'T00:00:00Z').getUTCDay()+6)%7];}
export function allocateHours(c:CalendarConfig,start:string,end:string,hours:number){const days=calendarDays(start,end),read=minuteReader(c),minutes=days.map(read),total=minutes.reduce((a,b)=>a+b,0);return {totalMinutes:total,byDay:Object.fromEntries(days.map((d,i)=>[d,total?hours*minutes[i]/total:0])),noWorkingDay:total===0};}
