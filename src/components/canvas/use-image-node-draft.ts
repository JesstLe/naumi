'use client';
import { useRef, useState, type SetStateAction } from 'react';
import { ImageNodeDraftStore, imageDraftKey, type ImageNodeDraft, type ImageNodeDraftPatch } from '@/lib/canvas/image-node-drafts';

export function useImageNodeDraft(scope: string | null, nodeId: string | null, defaults: ImageNodeDraft, readOnly = false) {
  const storeRef = useRef<ImageNodeDraftStore | null>(null);
  if (!storeRef.current) storeRef.current = new ImageNodeDraftStore(() => {
    try { return typeof window === 'undefined' ? null : window.sessionStorage; } catch { return null; }
  });
  const store = storeRef.current;
  const [, render] = useState(0);
  const key = readOnly ? null : imageDraftKey(scope, nodeId);
  const draft = { ...defaults, ...store.read(key) };
  // Resolve synchronously from the target key: no selection effect can copy A's
  // values into B, and multiple input updates in one event see the latest draft.
  function setField<K extends keyof ImageNodeDraft>(field: K, action: SetStateAction<ImageNodeDraft[K]>) {
    if (!key) return;
    const current = store.read(key)[field] ?? defaults[field];
    const next = typeof action === 'function' ? action(current) : action;
    if (next === current) return;
    store.write(key, { [field]: next });
    render(value => value + 1);
  }
  function seed(node: string, patch: ImageNodeDraftPatch, targetScope = scope) {
    if (readOnly) return;
    store.write(imageDraftKey(targetScope, node), patch);
    render(value => value + 1);
  }
  return {
    key, prompt: draft.prompt, ratio: draft.ratio, referenceBindings: draft.referenceBindings,
    setReferenceBindings: (value: ImageNodeDraft['referenceBindings']) => setField('referenceBindings', value),
    setPrompt: (value: SetStateAction<string>) => setField('prompt', value),
    setRatio: (value: SetStateAction<string>) => setField('ratio', value),
    seed,
  };
}
