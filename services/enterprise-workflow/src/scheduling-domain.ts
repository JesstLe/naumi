import { WorkflowError } from './contracts';
import { defaultLayout, systemColumns, type Field, type Layout, type SchedulingCommand, type View, type Workbook } from './scheduling-contracts';

export function ensure(ok: unknown, code: string, status = 409): asserts ok {
  if (!ok) throw new WorkflowError(status, code);
}
const unique = (values: string[]) => new Set(values).size === values.length;
export function validateLayout(config: Layout, fields: Field[]) {
  const ids = config.columns.map(c => c.id);
  ensure(unique(ids) && systemColumns.every(id => ids.includes(id)) && ids.every(id => systemColumns.includes(id) || fields.some(f => f.id === id)), 'INVALID_COLUMNS', 400);
  ensure(ids[0] === 'title' && config.columns[0].visible && config.columns[0].width >= 240, 'TITLE_COLUMN_REQUIRED', 400);
  ensure(unique(config.board.cardFields), 'DUPLICATE_CARD_FIELD', 400);
}
function newView(id: string, name: string, config: Layout, actor: string, at: string, reason: string): View {
  return { id, name, archived: false, revision: 1, published: config, draft: null,
    history: [{ revision: 1, config: structuredClone(config), actor, at, reason }] };
}
export function evolveWorkbook(previous: Workbook | null, command: SchedulingCommand, subject: string, at: string): Workbook {
  const a = command.action;
  ensure((previous?.version ?? 0) === command.expectedVersion, 'VERSION_CONFLICT');
  if (!previous) {
    ensure(a.type === 'initialize', 'WORKBOOK_NOT_FOUND', 404);
    const specs = [['team','总表','none','table'],['designer','设计人员分组','assignee','table'],['owner','下发人员分组','owner','table'],['grid','表格','none','table'],['board','按设计师分组','none','board']] as const;
    return { schema: 3, version: 1, fields: [],
      options: [['queue4','排队4天','blue'],['idle','空闲中','yellow'],['urgent','加急任务','orange'],['queue3','排队3天','green'],['queue5','排队5天以上','purple'],['queue10','排队10天以上','purple'],['priority','重点项目升级','orange']].map(([id,label,color]) => ({ id, label, color: color as Workbook['options'][number]['color'] })),
      views: specs.map(([id,name,group,renderer]) => newView(id, name, { ...defaultLayout(), group, renderer, density: id === 'grid' ? 'compact' : 'normal' }, subject, at, command.reason)) };
  }
  ensure(a.type !== 'initialize', 'ALREADY_EXISTS');
  const n = structuredClone(previous);
  const activeView = () => {
    ensure('viewId' in a, 'VIEW_REQUIRED', 400);
    const v = n.views.find(v => v.id === a.viewId); ensure(v, 'VIEW_NOT_FOUND', 404);
    ensure(!v.archived, 'VIEW_ARCHIVED'); return v;
  };
  const publish = (v: View, config: Layout) => {
    validateLayout(config, n.fields); v.revision++; v.published = structuredClone(config); v.draft = null;
    v.history.push({ revision: v.revision, config: structuredClone(config), actor: subject, at, reason: command.reason });
    v.history = v.history.slice(-20);
  };
  switch (a.type) {
    case 'create-view': {
      ensure(n.views.length < 20, 'VIEW_LIMIT'); ensure(!n.views.some(v => v.id === a.viewId), 'DUPLICATE_VIEW');
      const source = a.copyFrom ? n.views.find(v => v.id === a.copyFrom && !v.archived) : null;
      ensure(!a.copyFrom || source, 'VIEW_NOT_FOUND', 404);
      n.views.push(newView(a.viewId, a.name, structuredClone(source?.published ?? defaultLayout()), subject, at, command.reason)); break;
    }
    case 'rename-view': activeView().name = a.name; break;
    case 'archive-view': {
      const v = n.views.find(v => v.id === a.viewId); ensure(v, 'VIEW_NOT_FOUND', 404);
      ensure(!a.archived || v.archived || n.views.filter(v => !v.archived).length > 1, 'LAST_VIEW_REQUIRED'); v.archived = a.archived; break;
    }
    case 'reorder-views': {
      ensure(unique(a.viewIds) && a.viewIds.length === n.views.length && a.viewIds.every(id => n.views.some(v => v.id === id)), 'INVALID_VIEW_ORDER', 400);
      n.views = a.viewIds.map(id => n.views.find(v => v.id === id)!); break;
    }
    case 'save-draft': {
      const v = activeView(); ensure(v.revision === a.baseRevision, 'VIEW_VERSION_CONFLICT'); validateLayout(a.config, n.fields);
      v.draft = { baseRevision: a.baseRevision, config: structuredClone(a.config), actor: subject, at }; break;
    }
    case 'discard-draft': activeView().draft = null; break;
    case 'publish-view': {
      const v = activeView(); ensure(v.revision === a.baseRevision && v.draft?.baseRevision === v.revision, 'VIEW_VERSION_CONFLICT');
      publish(v, v.draft!.config); break;
    }
    case 'restore-view': {
      const v = activeView(), h = v.history.find(h => h.revision === a.revision); ensure(h, 'HISTORY_NOT_FOUND', 404); publish(v, h.config); break;
    }
    case 'set-fields': {
      ensure(unique(a.fields.map(f => f.id)) && unique(a.fields.map(f => f.label)), 'DUPLICATE_FIELD', 400);
      for (const f of a.fields) ensure(f.type === 'select' ? f.options.length > 0 && unique(f.options) : f.options.length === 0, 'INVALID_FIELD_OPTIONS', 400);
      // Stable field IDs and types; archive rather than delete. No lossy automatic data conversion.
      for (const f of n.fields) {
        const next = a.fields.find(x => x.id === f.id); ensure(next && next.type === f.type, 'FIELD_DELETE_OR_TYPE_CHANGE');
        ensure(f.options.every(o => next.options.includes(o)), 'FIELD_OPTION_DELETE');
      }
      n.fields = structuredClone(a.fields); break;
    }
    case 'set-options': {
      ensure(unique(a.options.map(o => o.id)) && unique(a.options.map(o => o.label)), 'DUPLICATE_OPTION', 400);
      // Tasks reference stable option IDs. Renaming/recoloring is allowed; deletion awaits explicit reference migration.
      ensure(n.options.every(o => a.options.some(x => x.id === o.id)), 'OPTION_DELETE_REQUIRES_REFERENCE_CHECK');
      n.options = structuredClone(a.options); break;
    }
    default: throw new WorkflowError(400, 'TEAM_COMMAND_REQUIRED');
  }
  ensure(unique(n.views.map(v => v.name)), 'DUPLICATE_VIEW_NAME', 400);
  n.version++; return n;
}

export function workbookForReader(workbook: Workbook, manager: boolean) {
  if (manager) return workbook;
  return { ...workbook, views: workbook.views.filter(v => !v.archived).map(({ draft: _draft, history: _history, ...v }) => v) };
}
