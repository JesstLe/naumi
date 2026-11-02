import React, { createContext, useContext, useState } from "react";
import { createRoot } from "react-dom/client";
import { CollaborationProvider, useCollaboration, useCollaborationState } from "../src/components/collaboration/collaboration-provider";
import { CanvasCollaborationActions, CollaborationEntry } from "../src/components/collaboration/collaboration-entry";
import { DesktopShell } from "../src/components/desktop/desktop-shell";
import { DesktopHome } from "../src/components/desktop/desktop-home";
import { ToastProvider } from "../src/components/ui/toast";
import "../src/app/desktop/desktop.css";

// Test-only composition root: the actual components/client use a local HTTP
// contract fixture; no fixtures or identities are imported by product code.
const Auth = createContext<any>(null);
export const useAuth = () => useContext(Auth);
export const authHeader = async () => { const actor = (window as any).__actor || ""; if ((window as any).__authDelay) await new Promise(resolve => setTimeout(resolve, (window as any).__authDelay)); return { Authorization: `Bearer ${actor}` }; };
function Route() {
  const { client, state } = useCollaborationState();
  const collab = useCollaboration();
  (window as any).__client = client;
  const [route, setRoute] = useState(location.pathname);
  (window as any).__route = (path: string) => { history.pushState({}, "", path); setRoute(path); window.dispatchEvent(new PopStateEvent("popstate")); };
  return <>
    <div className="fixture-controls"><span>LOCAL HTTP FIXTURE</span><button onClick={() => (window as any).__setActor("a@fixture.test")}>账户 A</button><button onClick={() => (window as any).__setActor("b@fixture.test")}>账户 B</button><button onClick={() => (window as any).__setActor(null)}>退出</button><button onClick={() => (window as any).__setReady(false)}>ready false</button><button onClick={() => (window as any).__setReady(true)}>ready true</button><button onClick={() => (window as any).__route(route === "/desktop" ? "/canvas" : "/desktop")}>切换路由</button></div>
    {route.startsWith("/desktop") ? <DesktopShell><DesktopHome /></DesktopShell> : <div className="fixture-canvas" data-testid="native-canvas-fixture"><header><b>Naumi</b><span>春日产品 · 创意方案</span><div><CanvasCollaborationActions source={{ projectKey: "tree:source-a", kind: "workflow" }} selection={{ projectKey: "tree:source-a", nodeIds: ["artwork-a", "text-a"], kind: "workflow" }} title="春日产品方案" /></div></header><div className="fixture-nodes"><article><img src="/fixture-product.svg" /><h2>产品视觉</h2></article><article><span>文案</span><h2>春日灵感，自在呈现</h2><p>柔和自然光、浅色背景，保留产品真实材质。</p></article></div><button className="fixture-selection" onClick={() => collab.share({ projectKey: "tree:source-a", nodeIds: ["artwork-a", "text-a"], kind: "workflow", title: "所选流程" })}>发送所选节点</button></div>}
    <output id="fixture-state" hidden>{JSON.stringify({ account: state.account, active: state.activeId, status: state.status, unread: collab.unread, uploads: state.uploads.map(u => ({ id: u.id, status: u.status, progress: u.progress })) })}</output>
  </>;
}
function Fixture() {
  const [actor, setActor] = useState<string | null>(sessionStorage.getItem("fixture-actor") || "a@fixture.test"), [ready, setReady] = useState(true);
  (window as any).__actor = actor;
  (window as any).__setActor = (value: string | null) => { (window as any).__actor = value; if (value) sessionStorage.setItem("fixture-actor", value); else sessionStorage.removeItem("fixture-actor"); setActor(value); };
  (window as any).__setReady = setReady;
  return <Auth.Provider value={{ user: actor ? { email: actor, name: actor.startsWith("a") ? "林夏" : "陈舟" } : null, ready, remaining: 1200, persistMode: "local", signOut: () => setActor(null) }}><ToastProvider><CollaborationProvider><Route /></CollaborationProvider></ToastProvider></Auth.Provider>;
}
createRoot(document.getElementById("root")!).render(<React.StrictMode><Fixture /></React.StrictMode>);
