"use client";

import { Component, Suspense, lazy, useEffect, useState, type ComponentProps, type ComponentType, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "@/lib/i18n/locale-context";

type BoundaryProps = { children: ReactNode; retry: () => void; close: () => void; visible: boolean };

function PanelFailure({ retry, close }: Pick<BoundaryProps, "retry" | "close">) {
  const { locale } = useI18n();
  const english = locale === "en";
  return createPortal(
    <section data-testid="canvas-panel-recovery" data-canvas-hotkeys-blocked="true" role="alert"
      className="fixed bottom-6 right-6 z-[260] w-[min(22rem,calc(100vw-3rem))] rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-800 shadow-sm"
      onPointerDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()}>
      <strong>{english ? "Panel unavailable" : "面板暂不可用"}</strong>
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={retry} className="rounded-lg bg-indigo-600 px-3 py-1.5 font-medium text-white">{english ? "Retry" : "重试"}</button>
        <button type="button" onClick={close} className="rounded-lg border border-slate-200 px-3 py-1.5 font-medium hover:bg-slate-50">{english ? "Close" : "关闭"}</button>
      </div>
    </section>, document.body
  );
}

class PanelBoundary extends Component<BoundaryProps, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? this.props.visible ? <PanelFailure retry={this.props.retry} close={this.props.close} /> : null : this.props.children;
  }
}

/** Client-only optional panel. A failed lazy import stays inside this boundary,
 * so the Canvas owner, unsaved edits and temporary File previews stay mounted.
 * React.lazy caches rejection: explicit retry must create a NEW lazy instance,
 * not merely reset an error flag or change a key around the rejected instance. */
export function recoverablePanel<T extends ComponentType<any>>(loader: () => Promise<T | { default: T }>, options: { loading: ComponentType }) {
  type P = ComponentProps<T>;
  const createPanel = () => lazy<ComponentType<P>>(async () => {
    const loaded = await loader();
    return { default: "default" in loaded ? loaded.default : loaded };
  });
  function RecoverablePanel(props: P) {
    const [mounted, setMounted] = useState(false);
    const [attempt, setAttempt] = useState(() => ({ number: 0, Panel: createPanel() }));
    const [dismissed, setDismissed] = useState(false);
    const open = (props as { open?: unknown }).open;
    useEffect(() => { setMounted(true); }, []);
    // Some dialogs intentionally stay mounted while closed (payment/comfy).
    // Reopening may show the failure again, but never silently resubmits work.
    useEffect(() => { if (open === true) setDismissed(false); }, [open]);
    const Loading = options.loading;
    // Preserve previous ssr:false behavior, including hydration: never invoke
    // the panel loader on the server or during the initial hydration render.
    if (!mounted) return <Loading />;
    if (dismissed) return null;
    const Panel = attempt.Panel;
    const close = () => {
      setDismissed(true);
      const onClose = (props as { onClose?: unknown }).onClose;
      if (typeof onClose === "function") onClose();
    };
    return <PanelBoundary key={attempt.number} visible={open !== false} retry={() => setAttempt(current => ({ number: current.number + 1, Panel: createPanel() }))} close={close}>
      <Suspense fallback={<Loading />}><Panel {...props} /></Suspense>
    </PanelBoundary>;
  }
  RecoverablePanel.displayName = "RecoverableCanvasPanel";
  return RecoverablePanel;
}
