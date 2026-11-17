import { TeamError } from '@/lib/teams/errors';

export type HierarchyNode = { email: string; supervisor_email: string; role_id: string | null };
export type HierarchyRole = { id: string; level: number; manage_members: boolean; view_records: boolean };

// The owner is depth zero. Keep the existing limit of 100 intermediate
// supervisors plus the member being validated.
const MAX_MEMBER_DEPTH = 101;
const invalidPath = () => new TeamError('组织关系存在循环或层级过深', 409);

export function validateHierarchy(owner: string, nodes: readonly HierarchyNode[], roles: readonly HierarchyRole[]) {
  const members = new Map(nodes.map(node => [node.email, node]));
  const permissions = new Map(roles.map(role => [role.id, role]));
  if (members.has(owner)) throw new TeamError('老板不能同时作为企业成员', 409);
  const depth = new Map([[owner, 0]]);
  for (const node of nodes) {
    const level = node.role_id ? permissions.get(node.role_id)?.level : 999;
    if (level === undefined) throw new TeamError('岗位不属于当前企业', 409);
    const supervisor = node.supervisor_email;
    let supervisorDepth = depth.get(supervisor);
    if (supervisorDepth === undefined) {
      // Only examine the unresolved suffix. A suffix is cached once it reaches
      // the owner or a known path; each member's role is still checked below.
      const path: string[] = [];
      const seen = new Set([node.email]);
      let cursor = supervisor;
      while ((supervisorDepth = depth.get(cursor)) === undefined) {
        if (seen.has(cursor) || seen.size >= MAX_MEMBER_DEPTH) throw invalidPath();
        const ancestor = members.get(cursor);
        if (!ancestor) throw new TeamError('上级不属于当前企业', 409);
        seen.add(cursor);
        path.push(cursor);
        cursor = ancestor.supervisor_email;
      }
      supervisorDepth += path.length;
      if (supervisorDepth >= MAX_MEMBER_DEPTH) throw invalidPath();
      for (let i = 0; i < path.length; i++) depth.set(path[i], supervisorDepth - i);
    }
    if (supervisor === node.email || supervisorDepth >= MAX_MEMBER_DEPTH) throw invalidPath();
    depth.set(node.email, supervisorDepth + 1);
    if (supervisor !== owner) {
      const parentRole = members.get(supervisor)?.role_id;
      const parent = parentRole ? permissions.get(parentRole) : undefined;
      if (!parent?.manage_members || parent.level >= level) {
        throw new TeamError('上级必须具有管理权限且等级高于成员', 409);
      }
    }
  }
}

/** Scope for a non-owner, computed from an already validated tenant hierarchy.
 * A paused ancestor hides a content branch; directory management can still
 * reach that branch so an authorized manager can restore paused memberships. */
export function descendantScope<T extends HierarchyNode>(nodes: readonly T[], actor: string,
  viewSubtree: boolean, manageSubtree: boolean, active: (member: T) => boolean) {
  const visible = new Set([actor]), manageable = new Set([actor]);
  if (!viewSubtree && !manageSubtree) return { visible, manageable };
  const children = new Map<string, T[]>();
  for (const node of nodes) {
    const supervisor = node.supervisor_email;
    const siblings = children.get(supervisor);
    if (siblings) siblings.push(node);
    else children.set(supervisor, [node]);
  }
  const branch = [{ email: actor, content: viewSubtree }];
  for (let i = 0; i < branch.length; i++) {
    const parent = branch[i];
    const direct = children.get(parent.email);
    if (!direct) continue;
    for (const member of direct) {
      if (visible.has(member.email) || manageable.has(member.email)) throw invalidPath();
      const content = parent.content && active(member);
      if (content) visible.add(member.email);
      if (manageSubtree) manageable.add(member.email);
      if ((content || manageSubtree) && children.has(member.email)) branch.push({ email: member.email, content });
    }
  }
  return { visible, manageable };
}
