'use client';

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { surfaceAppearanceClass, useSurfaceAppearance } from '@/components/ui/surface-appearance';
import { referenceMentionPlacement, type MentionPlacement } from '@/lib/canvas/reference-mention-placement';

type Props = {
  id: string; label: string; editorRef: RefObject<HTMLDivElement | null>;
  activeOption?: string; optionCount: number; onClose: () => void;
  revision?: string | number; children: ReactNode;
};

/** Non-modal listbox: focus and IME stay in the editor; only this panel scrolls. */
export function ReferenceMentionPanel({ id, label, editorRef, activeOption, optionCount, onClose, revision, children }: Props) {
  const appearance = useSurfaceAppearance() || 'light';
  const panel = useRef<HTMLDivElement>(null), close = useRef(onClose); close.current = onClose;
  const [placement, setPlacement] = useState<MentionPlacement | null>(null);
  useLayoutEffect(() => {
    let frame = 0;
    const update = () => {
      const editor = editorRef.current;
      if (!editor?.isConnected) { close.current(); return; }
      const box = editor.getBoundingClientRect(), body = editor.closest<HTMLElement>('[data-composer-body]')?.getBoundingClientRect();
      const visibleTop = Math.max(box.top, body?.top ?? box.top), visibleBottom = Math.min(box.bottom, body?.bottom ?? box.bottom);
      if (visibleBottom <= visibleTop) { close.current(); return; }
      let top = Math.max(visibleTop, visibleBottom - 24), bottom = visibleBottom;
      const selection = editor.ownerDocument.getSelection();
      if (selection?.rangeCount && selection.focusNode && editor.contains(selection.focusNode)) {
        const range = selection.getRangeAt(0).cloneRange(); range.collapse(false);
        const caret = range.getBoundingClientRect();
        if (caret.height > 0) { top = Math.max(visibleTop, Math.min(caret.top, visibleBottom - 1)); bottom = Math.max(top + 1, Math.min(caret.bottom, visibleBottom)); }
      }
      const view = window.visualViewport;
      const next = referenceMentionPlacement({ left: box.left, width: box.width, top, bottom },
        { width: view?.width || window.innerWidth, height: view?.height || window.innerHeight, left: view?.offsetLeft, top: view?.offsetTop }, optionCount);
      setPlacement(old => old && Object.keys(next).every(key => old[key as keyof MentionPlacement] === next[key as keyof MentionPlacement]) ? old : next);
    };
    const schedule = (event?: Event) => {
      if (event?.target instanceof Node && panel.current?.contains(event.target)) return;
      if (!frame) frame = requestAnimationFrame(() => { frame = 0; update(); });
    };
    update();
    const observer = new ResizeObserver(() => schedule());
    if (editorRef.current) { observer.observe(editorRef.current); const body = editorRef.current.closest('[data-composer-body]'); if (body) observer.observe(body); }
    window.addEventListener('resize', schedule); window.addEventListener('scroll', schedule, true);
    window.visualViewport?.addEventListener('resize', schedule); window.visualViewport?.addEventListener('scroll', schedule);
    return () => { observer.disconnect(); if (frame) cancelAnimationFrame(frame); window.removeEventListener('resize', schedule); window.removeEventListener('scroll', schedule, true); window.visualViewport?.removeEventListener('resize', schedule); window.visualViewport?.removeEventListener('scroll', schedule); };
  }, [editorRef, optionCount, revision]);
  useLayoutEffect(() => {
    const list = panel.current, option = activeOption ? document.getElementById(activeOption) : null;
    if (!list || !option || !list.contains(option)) return;
    const item = option.getBoundingClientRect(), visible = list.getBoundingClientRect();
    if (item.top < visible.top + 8) list.scrollTop -= visible.top + 8 - item.top;
    else if (item.bottom > visible.bottom - 8) list.scrollTop += item.bottom - visible.bottom + 8;
  }, [activeOption, placement]);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (!(event.target instanceof Node) || panel.current?.contains(event.target) || editorRef.current?.contains(event.target)) return;
      close.current();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.isComposing) close.current();
    };
    document.addEventListener('pointerdown', outside, true); document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside, true); document.removeEventListener('keydown', escape); };
  }, [editorRef]);
  if (typeof document === 'undefined') return null;
  return createPortal(<div ref={panel} id={id} role="listbox" aria-label={label}
    data-testid="reference-mention-panel" data-placement={placement?.side} data-canvas-hotkeys-blocked="true"
    className={`${surfaceAppearanceClass(appearance)} canvas-ui-control nodrag nopan nowheel`}
    style={{ position: 'fixed', zIndex: 210, left: placement?.left, top: placement?.top, width: placement?.width || 360,
      maxHeight: placement?.maxHeight || 1, visibility: placement ? 'visible' : 'hidden', overflowY: 'auto', overflowX: 'hidden',
      overscrollBehavior: 'contain', boxSizing: 'border-box', padding: 7, border: '1px solid var(--canvas-ui-border, #dbe3ef)', borderRadius: 12,
      background: 'var(--canvas-ui-panel-solid, #fff)', color: 'var(--canvas-ui-text, #334155)', boxShadow: '0 12px 36px rgb(15 23 42 / 16%)',
      display: 'grid', gridTemplateColumns: `repeat(${placement?.columns || 1}, minmax(0, 1fr))`, gap: 6 }}
    onPointerDown={event => event.stopPropagation()} onMouseDown={event => { if ((event.target as Element).closest('[role="option"]')) event.preventDefault(); }}
    onWheel={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>
    {children}
  </div>, document.body);
}
