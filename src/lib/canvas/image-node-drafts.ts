import { normalizeCanvasRatio } from './generation-parameters';
import { readImageReferenceBindings, type ImageReferenceBinding } from './image-references';

export type ImageNodeDraft = { prompt: string; ratio: string; referenceBindings?: ImageReferenceBinding[];hiddenReferenceIds?:string[];additionalReferenceIds?:string[] };
export type ImageNodeDraftPatch = Partial<ImageNodeDraft>;
type DraftStorage = Pick<Storage, 'getItem' | 'setItem'>;

export function imageDraftScope(actor: string | undefined, owner: string | null | undefined, project: string | null,workspace='personal') {
  // Keep personal draft keys compatible while separating enterprise workspaces.
  return actor ? JSON.stringify([actor.toLowerCase(), (owner || actor).toLowerCase(), project,...workspace!=='personal'?[workspace]:[]]) : null;
}

export function imageDraftKey(scope: string | null, nodeId: string | null) {
  return scope && nodeId ? `naumi:canvas-image-draft:v1:${JSON.stringify([scope, nodeId])}` : null;
}

/** Tab-local drafts never overwrite artwork history or send network requests.
 * Only edited fields are stored, so delayed artwork metadata can still supply defaults.
 * Memory remains authoritative if sessionStorage is unavailable or full. */
export class ImageNodeDraftStore {
  private drafts = new Map<string, ImageNodeDraftPatch>();
  constructor(private storage: () => DraftStorage | null = () => null) {}

  read(key: string | null): ImageNodeDraftPatch {
    if (!key) return {};
    const cached = this.drafts.get(key);
    if (cached) return cached;
    const draft: ImageNodeDraftPatch = {};
    try {
      const raw: unknown = JSON.parse(this.storage()?.getItem(key) || 'null');
      if (raw && typeof raw === 'object') {
        const value = raw as Record<string, unknown>;
        if (typeof value.prompt === 'string') draft.prompt = value.prompt;
        if (typeof value.ratio === 'string' && normalizeCanvasRatio(value.ratio) === value.ratio) draft.ratio = value.ratio;
        if (Array.isArray(value.referenceBindings)) draft.referenceBindings = readImageReferenceBindings(value.referenceBindings);
        if(Array.isArray(value.hiddenReferenceIds))draft.hiddenReferenceIds=[...new Set(value.hiddenReferenceIds.filter((id):id is string=>typeof id==='string'&&id.length>0&&id.length<=160))];
        if(Array.isArray(value.additionalReferenceIds))draft.additionalReferenceIds=[...new Set(value.additionalReferenceIds.filter((id):id is string=>typeof id==='string'&&id.length>0&&id.length<=160))];
      }
    } catch { /* Malformed or unavailable browser storage does not block editing. */ }
    this.drafts.set(key, draft);
    return draft;
  }

  write(key: string | null, patch: ImageNodeDraftPatch) {
    if (!key) return;
    const next = { ...this.read(key), ...patch };
    this.drafts.set(key, next);
    try { this.storage()?.setItem(key, JSON.stringify(next)); } catch { /* Keep in-memory draft. */ }
  }
}
