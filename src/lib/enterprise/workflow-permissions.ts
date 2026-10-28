import { z } from 'zod';

export const WORKFLOW_PERMISSIONS = ['request','dispatch','execute','review','manage'] as const;
export type WorkflowPermission = typeof WORKFLOW_PERMISSIONS[number];
export const workflowPermissionsSchema = z.array(z.enum(WORKFLOW_PERMISSIONS)).max(5).refine(values => new Set(values).size === values.length);
export const DEFAULT_WORKFLOW_PERMISSIONS: WorkflowPermission[] = ['request','execute'];
export const WORKFLOW_PERMISSION_LABELS: Record<WorkflowPermission, string> = {request:'提交需求',dispatch:'分派任务',execute:'制作与交付',review:'审核与验收',manage:'管理协作团队'};
