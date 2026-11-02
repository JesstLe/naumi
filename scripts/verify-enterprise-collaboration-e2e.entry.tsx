import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AuthProvider, useAuth } from '../src/lib/auth-context';
import { ToastProvider } from '../src/components/ui/toast';
import { CollaborationProvider, useCollaborationState } from '../src/components/collaboration/collaboration-provider';
import { CanvasClient } from '../src/components/canvas/canvas-client';
import { DesktopShell } from '../src/components/desktop/desktop-shell';
import { DesktopHome } from '../src/components/desktop/desktop-home';
import { FeatureAccessProvider } from '../src/lib/feature-access/client';
import { BillingProvider } from '../src/lib/billing/client';
import { ImageQualityProvider } from '../src/lib/image-quality-context';
import { TextModelProvider } from '../src/lib/text-model-context';
import { AuthModalProvider } from '../src/lib/auth-modal-context';
import { RechargeModalProvider } from '../src/lib/recharge-modal-context';
import { LocaleProvider } from '../src/lib/i18n/locale-context';
import { selectWorkspace } from '../src/lib/saas/workspace-client';
import '../src/app/desktop/desktop.css';

// Fixed browser test composition. No auth, chat, share, CanvasClient, native
// persistence, ReactFlow or media module is substituted. Next navigation alone
// is adapted to History API; unrelated supplier catalogue HTTP is explicit stub.
declare global { interface Window { __e2e: any; __route: (url: string) => void; } }
function Route() {
  const { client } = useCollaborationState(), auth = useAuth();
  const [url, setUrl] = useState(location.href);
  useEffect(() => { const f = () => setUrl(location.href); window.addEventListener('popstate', f); return () => window.removeEventListener('popstate', f); }, []);
  window.__e2e = { client, auth };
  const pathname = new URL(url).pathname;
  return pathname.startsWith('/desktop') ? <DesktopShell>{pathname === '/desktop/canvas' ? <CanvasClient desktopAppearance initialProject={new URL(url).searchParams.get('project') || undefined} /> : <DesktopHome />}</DesktopShell> : <CanvasClient />;
}
async function start() {
  const info = await fetch('/__fixture').then(r => r.json());
  selectWorkspace(info.enterprise);
  window.__route = url => { history.pushState({}, '', url); window.dispatchEvent(new PopStateEvent('popstate')); };
  createRoot(document.getElementById('root')!).render(<React.StrictMode><LocaleProvider initialLocale="zh"><AuthProvider><ToastProvider><FeatureAccessProvider><BillingProvider><TextModelProvider><ImageQualityProvider><AuthModalProvider><RechargeModalProvider><CollaborationProvider><Route /></CollaborationProvider></RechargeModalProvider></AuthModalProvider></ImageQualityProvider></TextModelProvider></BillingProvider></FeatureAccessProvider></ToastProvider></AuthProvider></LocaleProvider></React.StrictMode>);
}
void start();
