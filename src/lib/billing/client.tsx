"use client";
import { invalidateBrowserData } from "@/lib/browser-data-cache";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { authHeader } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import type { FeatureId } from "./types";
import {clientIntentKey,frozenIntentBody} from "./client-intent";
import { MODEL_CATALOG_REFRESH } from "../model-config/public-client";
import { chosenFeatureModel, FEATURE_MODEL_SELECTION } from "../model-config/feature-client";
import { browserRandomUUID } from "../browser-crypto";
import {currentWorkspace,currentWorkspaceRevision,WORKSPACE_SELECTION} from "../saas/workspace-client";
export type PublicQuote = {
    quote?:{id:string;expiresAt:string};
    selection?:QuoteInput;
    requestedParameters?: {quality:string;resolution:string;ratio:string};
    effectiveParameters?: {quality:string;resolution:string;ratio:string};
    modelVersion?: number;
    modelId?: string;
    mode?: string;
    authorization?: boolean;
    version: number;
    credits: number;
    reserveCredits: number;
    authorizedCredits?: number;
    feature: FeatureId;
    quantity: number;
};
export type QuoteInput = {
    canvas?:boolean;
    feature: FeatureId;
    quantity: number;
    quality?: string;
    resolution?: string;
    modelId?: string;
    providerId?: string;
    ratio?: string;
};
type QuoteScope = { workspace: string; projectContext?: string };
export type PublicCatalog = {
    version: number;
    features: Record<FeatureId, {
        label: string;
        enabled: boolean;
        unit: string;
        prices: Record<string, Record<string, number | null>>;
    }>;
    products: {
        id: string;
        title: string;
        amountFen: number;
        credits: number;
        baseCredits: number;
        bonusCredits: number;
        expiry: {
            unit: string;
            value: number;
        };
    }[];
    thresholds: {
        highQualityPaidFen: number;
        agentConfirmCredits: number;
    };
    effective: {
        metering: boolean;
        commerce: boolean;
        recharge: boolean;
    };
};
type Client = {
    catalog: PublicCatalog | null;
    loading: boolean;
    error: string | null;
    refresh: () => Promise<void>;
    quote: (input: QuoteInput, requestScope?: QuoteScope) => Promise<PublicQuote>;
    submit: (url: string, init: RequestInit, displayed: PublicQuote | null, onIdentity?: (id: string) => void) => Promise<Response>;
    quoteAndSubmit: (url: string, init: RequestInit, input: QuoteInput, beforeSubmit?: () => void) => Promise<Response>;
};
const Context = createContext<Client | null>(null);
export function BillingProvider({ children }: {
    children: ReactNode;
}) {
    const { user, ready } = useAuth(), [catalog, setCatalog] = useState<PublicCatalog | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState<string | null>(null);
    const cache = useRef(new Map<string, Promise<PublicQuote>>()), epoch = useRef(0);
    const actor = useRef({email:user?.email,revision:0});
    if(actor.current.email!==user?.email)actor.current={email:user?.email,revision:actor.current.revision+1};
    const [quoteRevision,setQuoteRevision]=useState(0);
    const intents=useRef(new Map<string,string>());
    const refresh = useCallback(async () => {
        const generation = ++epoch.current;
        const actorRevision=actor.current.revision,workspaceRevision=currentWorkspaceRevision();
        const isCurrent=()=>generation===epoch.current&&actorRevision===actor.current.revision&&workspaceRevision===currentWorkspaceRevision();
        setLoading(true);
        cache.current.clear();
        try {
            const headers=await authHeader();
            if(!isCurrent())return;
            const res = await fetch("/api/billing/catalog", { cache: "no-store", headers }), data = await res.json();
            if (!res.ok)
                throw new Error(data.error || "报价暂不可用");
            if (isCurrent()) {
                setCatalog(data);
                setError(null);
            }
        }
        catch (e) {
            if (isCurrent()) {
                setCatalog(null);
                setError(e instanceof Error ? e.message : "报价暂不可用");
            }
        }
        finally {
            if (isCurrent())
                setLoading(false);
        }
    }, []);
    useEffect(() => { if (ready)
        void refresh(); }, [ready, user?.email, refresh]);
    useEffect(()=>{const changed=()=>{cache.current.clear();setQuoteRevision(value=>value+1);};const modelsChanged=()=>{changed();void refresh();};window.addEventListener(FEATURE_MODEL_SELECTION,changed);window.addEventListener(MODEL_CATALOG_REFRESH,modelsChanged);window.addEventListener(WORKSPACE_SELECTION,modelsChanged);return()=>{window.removeEventListener(FEATURE_MODEL_SELECTION,changed);window.removeEventListener(MODEL_CATALOG_REFRESH,modelsChanged);window.removeEventListener(WORKSPACE_SELECTION,modelsChanged);};},[refresh]);
    const getQuote = useCallback((rawInput: QuoteInput, requestScope?: QuoteScope) => {
        const input = { ...rawInput, modelId: rawInput.modelId || chosenFeatureModel(rawInput.feature) };
        // A dedicated site's old personal canvas can differ from the default
        // workspace. Quote the same authorized project as the eventual POST.
        const scope = requestScope ?? { workspace: currentWorkspace() };
        const owner=user?.email,actorRevision=actor.current.revision,workspaceRevision=currentWorkspaceRevision();
        const isCurrent=()=>owner===actor.current.email&&actorRevision===actor.current.revision&&workspaceRevision===currentWorkspaceRevision()&&scope.workspace===currentWorkspace();
        const key = JSON.stringify([owner,actorRevision,workspaceRevision,catalog?.version,quoteRevision,input,scope]);
        let promise = cache.current.get(key);
        if (promise)
            return promise;
        promise = (async () => { const {canvas,...facts}=input,headers=new Headers(await authHeader());
            if(!isCurrent())throw new Error("创作空间已切换");
            headers.set("content-type", "application/json");
            headers.set("x-naumi-workspace", scope.workspace);
            if (scope.projectContext) headers.set("x-naumi-project-context", scope.projectContext);
            if (canvas) headers.set("x-naumi-canvas", "1");
            const res = await fetch("/api/billing/quote", { method: "POST", headers, body: JSON.stringify(facts) }), data = await res.json();
            if(!isCurrent())throw new Error("创作空间已切换");
            if (!res.ok) throw new Error(data.error || "报价暂不可用");
            if(!Number.isSafeInteger(data.credits)||data.credits<0)throw new Error("报价金额无效");
            return {...data,selection:input} as PublicQuote; })();
        if (cache.current.size >= 200)
            cache.current.clear();
        cache.current.set(key, promise);
        promise.catch(() => {if(cache.current.get(key)===promise)cache.current.delete(key);});
        return promise;
    }, [catalog,user?.email,quoteRevision]);
    const submit = useCallback(async (url: string, init: RequestInit, displayed: PublicQuote | null, onIdentity?: (id: string) => void) => {
        if (!displayed)
            throw new Error("报价正在加载或暂不可用，请稍后重试");
        const headers = new Headers(init.headers);
        if(displayed.quote)headers.set("x-naumi-image-quote",displayed.quote.id);
        if (displayed?.modelVersion) headers.set("x-naumi-model-version", String(displayed.modelVersion));
        if (displayed?.modelId) headers.set("x-naumi-feature-model", displayed.modelId);
        headers.set("x-naumi-billing-version", String(displayed.version));
        headers.set("x-naumi-billing-credits", String(displayed.mode==="api-cost-plus" ? displayed.authorizedCredits ?? displayed.reserveCredits : displayed.credits));
        const key=await clientIntentKey(user?.email||"",url,{...init,headers});
        // A retained task's explicit operation is authoritative. A later task
        // with identical content must not replace its original receipt identity.
        let id=headers.get("x-naumi-billing-operation-id")||intents.current.get(key);try{id=id||localStorage.getItem(key)||undefined;}catch{}
        id=id||browserRandomUUID();intents.current.set(key,id);try{localStorage.setItem(key,id);}catch{}
        headers.set("x-naumi-billing-operation-id",id);
        const clearIntent=()=>{if(intents.current.get(key)===id)intents.current.delete(key);try{if(localStorage.getItem(key)===id)localStorage.removeItem(key);}catch{}};
        onIdentity?.(id);
        // Maintenance TTL never replaces this intent's server-owned price.
        // Send the original quote and operation to the receipt-first path.
        const post=()=>{
            // Scope can change during hashing or response JSON.
            // Keep this synchronous guard immediately adjacent to every paid POST.
            onIdentity?.(id);
            return fetch(url, { ...frozenIntentBody(init,id), headers });
        };
        const response=await post();
        if (response.ok && response.body && response.headers.get("content-type")?.includes("text/event-stream")) {
            const decoder = new TextDecoder(); let buffer = "";
            const body = response.body.pipeThrough(new TransformStream<Uint8Array,Uint8Array>({ transform(chunk, controller) {
                controller.enqueue(chunk); buffer += decoder.decode(chunk,{stream:true});
                const events=buffer.split("\n\n"); buffer=events.pop()||"";
                for(const event of events) if(event.split("\n").includes("event: done")) {
                    const data=event.split("\n").find(line=>line.startsWith("data: "));
                    try { if(data&&JSON.parse(data.slice(6)).ok===true){ invalidateBrowserData(user?.email); clearIntent(); } } catch {}
                }
            } }));
            return new Response(body,{status:response.status,headers:response.headers});
        }
        const data=await response.clone().json().catch(()=>null);
        if(data&&data.code!=="OPERATION_PENDING"&&data.code!=="OPERATION_CONFLICT"&&(response.ok||response.status<500&&!displayed.quote))clearIntent();
        if (response.status === 409 && data?.code === "PRICE_CHANGED")
            await refresh();
        if (response.status === 409 && data?.code === "MODEL_CHANGED") window.dispatchEvent(new Event(MODEL_CATALOG_REFRESH));
        return response;
    }, [refresh,user?.email]);
    const quoteAndSubmit = useCallback(async (url: string, init: RequestInit, input: QuoteInput, beforeSubmit?: () => void) => {
        beforeSubmit?.();
        const headers = new Headers(init.headers);
        // Carry only creation scope, never credentials, execution tokens or an
        // earlier quote into the quote cache/request. Auth is resolved freshly.
        const q = await getQuote(input, { workspace: headers.get("x-naumi-workspace") || currentWorkspace(),
            projectContext: headers.get("x-naumi-project-context") || undefined });
        beforeSubmit?.();
        // The freshly obtained server quote is authoritative, not a separate
        // catalogue version that may have changed during the same click.
        // submit invokes this after hashing the frozen body and before its paid POST.
        return submit(url, init, q, beforeSubmit);
    }, [getQuote, submit]);
    return <Context.Provider value={{ catalog, loading, error, refresh, quote: getQuote, submit, quoteAndSubmit }}>{children}</Context.Provider>;
}
export function useBilling() { const value = useContext(Context); if (!value)
    throw new Error("BillingProvider is missing"); return value; }
export function useBillingEstimate(input: QuoteInput, enabled=true) {
    const billing = useBilling(), { user } = useAuth(), email=user?.email, serializedInput=JSON.stringify(input),key = JSON.stringify([email,serializedInput,enabled]), [result, setResult] = useState<{
        key: string;
        quote: PublicQuote | null;
        error: string | null;
    }>({ key: "", quote: null, error: null });
    const quoteRequest=billing.quote;
    useEffect(() => {
        let cancelled = false;
        setResult({ key, quote: null, error: null });
        if (!email||!enabled)
            return;
        quoteRequest(JSON.parse(serializedInput)).then(q => { if (!cancelled)
            setResult({ key, quote: q, error: null }); }).catch(e => { if (!cancelled)
            setResult({ key, quote: null, error: e instanceof Error ? e.message : "报价暂不可用" }); });
        return () => { cancelled = true; };
    }, [key, serializedInput, quoteRequest, email,enabled]);
    const current = result.key === key ? result.quote : null;
    return { quote: current, cost: current?.credits ?? 0, loading: enabled&&!!user && !current && !result.error, error: enabled?result.error:null, submit: (url: string, init: RequestInit, beforeSubmit?:()=>void) => billing.submit(url, init, current, beforeSubmit) };
}
export function resolutionQuoteLabel(quote:PublicQuote|null) {
    return quote?.requestedParameters?.resolution && quote.effectiveParameters?.resolution && quote.requestedParameters.resolution!==quote.effectiveParameters.resolution ? ` · ${quote.requestedParameters.resolution}→${quote.effectiveParameters.resolution} · 报价不变` : "";
}
export function BillingEstimate({ input }: {
    input: QuoteInput;
}) { const state = useBillingEstimate(input); return <span data-testid="billing-estimate" role="status">{state.error || (!state.quote ? "报价加载中…" : state.quote.mode==="api-cost-plus" ? `估算 ${state.cost} 积分 · 上限 ${state.quote.authorizedCredits ?? state.quote.reserveCredits}` : `${state.cost} 积分`)}{resolutionQuoteLabel(state.quote)}</span>; }
