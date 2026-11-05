import type { LinkedImageTextResult } from "./linked-image-text";

export type PrepareLinkedImageTextInput = {
  read: () => LinkedImageTextResult;
  flush: (ids: readonly string[]) => Promise<unknown>;
  wait: (ids: readonly string[]) => Promise<unknown>;
  /** Must include queued edits as well as dirty/in-flight persistence state. */
  isUnsaved: (id: string) => boolean;
  isCurrent: () => boolean;
};

/**
 * Prepare only the currently linked sources; never flush unrelated canvas
 * drafts or generate anything. A save ACK is not proof that a later edit or
 * newly connected source is saved, so resolve again after both save barriers.
 */
export async function prepareLinkedImageText(input: PrepareLinkedImageTextInput): Promise<LinkedImageTextResult> {
  if (!input.isCurrent()) throw new Error("画布已切换，请重新生成");
  const initial = input.read();
  if (initial.error) throw new Error(initial.error);

  const ids = [...new Set(initial.sources.map(source => source.id))];
  try {
    await input.flush(ids);
    await input.wait(ids);
  } catch {
    throw new Error("关联的文字保存失败，请重试");
  }

  if (!input.isCurrent()) throw new Error("画布已切换，请重新生成");
  const latest = input.read();
  if (latest.error) throw new Error(latest.error);
  // Keep this final read/check/return synchronous: an additional await would
  // admit another edit between validation and handing the snapshot to caller.
  if (latest.sources.some(source => input.isUnsaved(source.id))) {
    throw new Error("关联的文字尚未保存，请稍后重试");
  }
  return latest;
}
