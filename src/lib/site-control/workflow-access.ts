import { siteProfile } from './store';
import { TeamError } from '@/lib/teams/server';

const paths: Record<string, string> = {
  worklogs: 'performance', performance: 'performance', corrections: 'performance', appeals: 'performance',
  uploads: 'assets', files: 'assets', publications: 'assets', 'publication-files': 'assets', 'publication-preflight': 'assets',
  source: 'tasks', reviews: 'tasks', references: 'requirements', 'demand-files': 'requirements',
  'demand-batches': 'requirements', projects: 'requirements', guidelines: 'requirements', forms: 'requirements', catalog: 'requirements',
  imports: 'schedule', sla: 'schedule', capacity: 'schedule', routing: 'routing', notifications: 'notifications',
};
export function workflowModulesFor(url: URL, commandType?: string, method = 'GET'): string[] | null {
  const tail = url.pathname.replace(/^\/api\/enterprise\/workflow\/?/, '');
  if (tail) {
    if (['uploads','files','source','reviews'].includes(tail)) return ['tasks','assets'];
    if (method==='GET' && ['references','demand-files','projects','guidelines','forms','catalog'].includes(tail)) return ['requirements','tasks','assets'];
    return paths[tail] ? [paths[tail]] : null;
  }
  const action = url.searchParams.get('action') || '';
  if (['discovery', 'context'].includes(action)) return [];
  if (action === 'command') {
    if (!commandType) return []; // The bounded, parsed command is checked by the write entry below.
    if (['create','revise-requirement','submit-requirement','return-requirement','approve-requirement','plan-tasks','publish','operations-signoff','operations-followup','cancel','archive'].includes(commandType) || commandType.startsWith('set-demand-')) return ['requirements'];
    if (['set-task-plan','move-task-plan','set-task-tag'].includes(commandType)) return ['schedule'];
    return ['tasks']; // Task commands still undergo the workflow's strict schema and role checks.
  }
  if (action === 'dashboard') return ['dashboard'];
  if (/^(people|handover-candidates)/.test(action)) return [action === 'handover-candidates' ? 'tasks' : 'people'];
  if (['order','history'].includes(action)) return ['requirements','tasks','schedule','assets','performance','dashboard'];
  if (action==='assignees') return ['requirements','tasks','schedule'];
  if (['orders','intake','pause-preview','cancellation-preview','change-preview'].includes(action)) return ['requirements'];
  if (action === 'facts') return ['performance'];
  if (/^(imports-|worksheet|schedule|personal$|week$|calendar|availability|plan-move)/.test(action)) return ['schedule'];
  if (/^(tasks$|assignees$|batch-)/.test(action)) return ['tasks'];
  return null;
}
export async function assertWorkflowSiteAccess(request: Request, commandType?: string) {
  const site = await siteProfile();
  if (site.mode === 'platform') return;
  const required = workflowModulesFor(new URL(request.url), commandType, request.method);
  if (!required || !site.policy.enabledFeatures.includes('team') || required.length > 0 && !required.some(id => site.policy.workspaceModules.includes(id))) throw new TeamError('此协作功能尚未开放', 403);
}
