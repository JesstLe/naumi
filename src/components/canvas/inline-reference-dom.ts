/** DOM projection only: reference identity and the wire token remain separate. */
export type InlineReferenceToken = {
  start: number; end: number; raw: string; key: string; title: string;
  thumbnail?: string; detail?: string; missing?: boolean;
};
export type InlineSelection = { start: number; end: number };
export type InlineThumbnailSlot = { key: string; referenceKey: string; source: string; container: HTMLElement };

export function inlineText(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.nodeValue || "";
  if (!(node instanceof HTMLElement)) return Array.from(node.childNodes).map(inlineText).join("");
  if (node.dataset.inlineToken !== undefined) return node.dataset.inlineToken;
  if (node.tagName === "BR") return node.dataset.inlineTail !== undefined ? "" : "\n";
  let value = "";
  for (const child of Array.from(node.childNodes)) {
    const block = child instanceof HTMLElement && /^(DIV|P)$/.test(child.tagName);
    if (block && value && !value.endsWith("\n")) value += "\n";
    value += inlineText(child);
  }
  return value;
}

function pointOffset(root: Node, target: Node, offset: number): number {
  if (root === target) {
    if (root.nodeType === Node.TEXT_NODE) return Math.min(offset, (root.nodeValue || "").length);
    return Array.from(root.childNodes).slice(0, offset).reduce((sum, child) => sum + inlineText(child).length, 0);
  }
  if (root instanceof HTMLElement && root.dataset.inlineToken !== undefined && root.contains(target)) {
    return offset === 0 ? 0 : root.dataset.inlineToken.length;
  }
  let length = 0;
  for (const child of Array.from(root.childNodes)) {
    if (child === target || child.contains(target)) return length + pointOffset(child, target, offset);
    length += inlineText(child).length;
  }
  return length;
}

export function readInlineSelection(root: HTMLElement): InlineSelection | null {
  const selection = root.ownerDocument.getSelection();
  if (!selection?.anchorNode || !selection.focusNode || !root.contains(selection.anchorNode) || !root.contains(selection.focusNode)) return null;
  const a = pointOffset(root, selection.anchorNode, selection.anchorOffset), b = pointOffset(root, selection.focusNode, selection.focusOffset);
  return { start: Math.min(a, b), end: Math.max(a, b) };
}

export function setInlineSelection(root: HTMLElement, selection: InlineSelection) {
  const locate = (offset: number): { node: Node; offset: number } => {
    let remaining = Math.max(0, offset);
    const visit = (node: Node): { node: Node; offset: number } | null => {
      if (node.nodeType === Node.TEXT_NODE) {
        const length = (node.nodeValue || "").length;
        if (remaining <= length) return { node, offset: remaining };
        remaining -= length; return null;
      }
      if (node instanceof HTMLElement && node.dataset.inlineToken !== undefined) {
        const length = node.dataset.inlineToken.length;
        if (remaining <= length) {
          const parent = node.parentNode!, index = Array.prototype.indexOf.call(parent.childNodes, node);
          return { node: parent, offset: index + (remaining === 0 ? 0 : 1) };
        }
        remaining -= length; return null;
      }
      for (const child of Array.from(node.childNodes)) { const found = visit(child); if (found) return found; }
      return null;
    };
    return visit(root) || { node: root, offset: root.childNodes.length };
  };
  const from = locate(selection.start), to = locate(selection.end), range = root.ownerDocument.createRange();
  range.setStart(from.node, from.offset); range.setEnd(to.node, to.offset);
  const current = root.ownerDocument.getSelection(); current?.removeAllRanges(); current?.addRange(range);
}

export function wholeInlineSelection(selection: InlineSelection, tokens: readonly InlineReferenceToken[]): InlineSelection {
  let { start, end } = selection;
  for (const token of tokens) {
    if (start > token.start && start < token.end) start = token.start;
    if (end > token.start && end < token.end) end = token.end;
  }
  return { start, end };
}

export function renderInlineReferences(root: HTMLElement, value: string, tokens: readonly InlineReferenceToken[]) {
  const doc = root.ownerDocument, fragment = doc.createDocumentFragment(); let cursor = 0;
  const existing = new Map(Array.from(root.querySelectorAll<HTMLElement>("[data-inline-instance]")).map(chip => [chip.dataset.inlineInstance!, chip]));
  const occurrences = new Map<string, number>(), thumbnails: InlineThumbnailSlot[] = [];
  for (const token of tokens) {
    if (token.start < cursor || token.end > value.length) continue;
    fragment.append(doc.createTextNode(value.slice(cursor, token.start)));
    const occurrence = occurrences.get(token.key) || 0; occurrences.set(token.key, occurrence + 1);
    const instance = JSON.stringify([token.key, occurrence]), appearance = JSON.stringify([token.raw, token.title, token.detail, token.thumbnail, token.missing]);
    const previous = existing.get(instance);
    // Moving a stable chip preserves its React portal/CachedImage lease while
    // surrounding text changes. No extra thumbnail authorization per keystroke.
    if (previous?.dataset.inlineAppearance === appearance) {
      const container = previous.querySelector<HTMLElement>("[data-inline-thumbnail]");
      if (container && token.thumbnail) thumbnails.push({ key: instance, referenceKey: token.key, source: token.thumbnail, container });
      fragment.append(previous); cursor = token.end; continue;
    }
    const chip = doc.createElement("span");
    chip.contentEditable = "false"; chip.draggable = false;
    chip.dataset.inlineInstance = instance; chip.dataset.inlineAppearance = appearance;
    chip.dataset.inlineToken = token.raw; chip.dataset.referenceKey = token.key;
    chip.dataset.referenceMissing = String(!!token.missing);
    chip.setAttribute("role", "button"); chip.setAttribute("aria-label", token.title); chip.tabIndex = -1;
    chip.title = [token.title, token.detail].filter(Boolean).join(" · ");
    chip.style.cssText = `display:inline-flex;align-items:center;vertical-align:middle;gap:4px;max-width:220px;height:24px;margin:0 2px;padding:1px 7px 1px 3px;border:1px solid ${token.missing ? "#fecaca" : "#c7d8f1"};border-radius:7px;background:${token.missing ? "#fff1f2" : "#eef5ff"};color:${token.missing ? "#be123c" : "#255a9c"};font-size:12px;font-weight:500;line-height:20px;white-space:nowrap;user-select:all;cursor:${token.missing ? "default" : "pointer"};`;
    if (token.thumbnail && !token.missing) {
      // React mounts the existing authorized CachedImage into this slot. The
      // DOM projection must never fetch private media through a naked img.
      const container = doc.createElement("span"); container.dataset.inlineThumbnail = "";
      container.style.cssText = "display:inline-flex;width:18px;height:18px;flex-shrink:0"; chip.append(container);
      thumbnails.push({ key: instance, referenceKey: token.key, source: token.thumbnail, container });
    } else { const mark = doc.createElement("span"); mark.textContent = token.missing ? "!" : "@"; mark.style.cssText = "width:17px;text-align:center;opacity:.7;flex-shrink:0"; chip.append(mark); }
    const label = doc.createElement("span"); label.textContent = token.title;
    label.style.cssText = "overflow:hidden;text-overflow:ellipsis;min-width:0"; chip.append(label);
    if (token.detail) { const detail = doc.createElement("span"); detail.textContent = token.detail; detail.style.cssText = "font-size:10px;opacity:.65;flex-shrink:0"; chip.append(detail); }
    fragment.append(chip); cursor = token.end;
  }
  fragment.append(doc.createTextNode(value.slice(cursor)));
  if (value.endsWith("\n")) { const tail = doc.createElement("br"); tail.dataset.inlineTail = ""; fragment.append(tail); }
  root.replaceChildren(fragment); root.dataset.empty = String(!value);
  return thumbnails;
}
