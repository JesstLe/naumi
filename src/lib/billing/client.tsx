"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { authHeader } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import type { FeatureId } from "./types";
import {clientIntentKey,frozenIntentBody} from "./client-intent";
import { MODEL_CATALOG_REFRESH } from "../model-config/public-client";
import { browserRandomUUID } from "../browser-crypto";
export type PublicQuote = {
    version: number;
    credits: number;
    reserveCredits: number;
    feature: FeatureId;
    quantity: number;
};
export type QuoteInput = {
    feature: FeatureId;
    quantity: number;
    quality?: string;
    resolution?: string;
    modelId?: string;
    providerId?: string;
    ratio?: string;
};
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
    quote: (input: QuoteInput) => Promise<PublicQuote>;
    submit: (url: string, init: RequestInit, displayed: PublicQuote | null) => Promise<Response>;
    quoteAndSubmit: (url: string, init: RequestInit, input: QuoteInput) => Promise<Response>;
};
const Context = createContext<Client | null>(null);
export function BillingProvider({ children }: {
    children: ReactNode;
}) {
    const { user, ready } = useAuth(), [catalog, setCatalog] = useState<PublicCatalog | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState<string | null>(null);
    const cache = useRef(new Map<string, Promise<PublicQuote>>()), epoch = useRef(0);
    const intents=useRef(new Map<string,string>());
    const refresh = useCallback(async () => {
        const generation = ++epoch.current;
        setLoading(true);
        cache.current.clear();
        try {
            const res = await fetch("/api/billing/catalog", { cache: "no-store", headers: await authHeader() }), data = await res.json();
            if (!res.ok)
                throw new Error(data.error || "报价暂不可用");
            if (generation === epoch.current) {
                setCatalog(data);
                setError(null);
            }
        }
        catch (e) {
            if (generation === epoch.current) {
                setCatalog(null);
                setError(e instanceof Error ? e.message : "报价暂不可用");
            }
        }
        finally {
            if (generation === epoch.current)
                setLoading(false);
        }
    }, []);
    useEffect(() => { if (ready)
        void refresh(); }, [ready, user?.email, refresh]);
    const getQuote = useCallback((input: QuoteInput) => {
        const key = JSON.stringify([catalog?.version, input]);
        let promise = cache.current.get(key);
        if (promise)
            return promise;
        promise = (async () => { const res = await fetch("/api/billing/quote", { method: "POST", headers: { "content-type": "application/json", ...await authHeader() }, body: JSON.stringify(input) }), data = await res.json(); if (!res.ok)
            throw new Error(data.error || "报价暂不可用"); return data as PublicQuote; })();
        if (cache.current.size >= 200)
            cache.current.clear();
        cache.current.set(key, promise);
        promise.catch(() => cache.current.delete(key));
        return promise;
    }, [catalog]);
    const submit = useCallback(async (url: string, init: RequestInit, displayed: PublicQuote | null) => {
        if (!displayed)
            throw new Error("报价正在加载或暂不可用，请稍后重试");
        const headers = new Headers(init.headers);
        headers.set("x-naumi-billing-version", String(displayed.version));
        headers.set("x-naumi-billing-credits", String(displayed.credits));
        const key=await clientIntentKey(user?.email||"",url,init);
        let id=intents.current.get(key);try{id=id||localStorage.getItem(key)||undefined;}catch{}
        id=id||headers.get("x-naumi-billing-operation-id")||browserRandomUUID();intents.current.set(key,id);try{localStorage.setItem(key,id);}catch{}
        headers.set("x-naumi-billing-operation-id",id);
        const response = await fetch(url, { ...frozenIntentBody(init,id), headers });
        if (response.ok && response.body && response.headers.get("content-type")?.includes("text/event-stream")) {
            const decoder = new TextDecoder(); let buffer = "";
            const body = response.body.pipeThrough(new TransformStream<Uint8Array,Uint8Array>({ transform(chunk, controller) {
                controller.enqueue(chunk); buffer += decoder.decode(chunk,{stream:true});
                const events=buffer.split("\n\n"); buffer=events.pop()||"";
                for(const event of events) if(event.split("\n").includes("event: done")) {
                    const data=event.split("\n").find(line=>line.startsWith("data: "));
                    try { if(data&&JSON.parse(data.slice(6)).ok===true){ intents.current.delete(key); try{localStorage.removeItem(key);}catch{} } } catch {}
                }
            } }));
            return new Response(body,{status:response.status,headers:response.headers});
        }
        const data=await response.clone().json().catch(()=>({}));
        if(response.ok||response.status<500&&data.code!=="OPERATION_PENDING"&&data.code!=="OPERATION_CONFLICT"){intents.current.delete(key);try{localStorage.removeItem(key);}catch{}}
        if (response.status === 409 && data.code === "PRICE_CHANGED")
            await refresh();
        if (response.status === 409 && data.code === "MODEL_CHANGED") window.dispatchEvent(new Event(MODEL_CATALOG_REFRESH));
        return response;
    }, [refresh,user?.email]);
    const quoteAndSubmit = useCallback(async (url: string, init: RequestInit, input: QuoteInput) => {
        if (!catalog)
            throw new Error("报价加载中，请稍后重试");
        const q = await getQuote(input);
        if (q.version !== catalog.version) {
            await refresh();
            throw new Error("价格已更新，请确认最新报价后重新提交");
        }
        return submit(url, init, q);
    }, [catalog, getQuote, refresh, submit]);
    return <Context.Provider value={{ catalog, loading, error, refresh, quote: getQuote, submit, quoteAndSubmit }}>{children}</Context.Provider>;
}
export function useBilling() { const value = useContext(Context); if (!value)
    throw new Error("BillingProvider is missing"); return value; }
export function useBillingEstimate(input: QuoteInput) {
    const billing = useBilling(), { user } = useAuth(), email=user?.email, serializedInput=JSON.stringify(input),key = JSON.stringify([email,serializedInput]), [result, setResult] = useState<{
        key: string;
        quote: PublicQuote | null;
        error: string | null;
    }>({ key: "", quote: null, error: null });
    const quoteRequest=billing.quote;
    useEffect(() => {
        let cancelled = false;
        setResult({ key, quote: null, error: null });
        if (!email)
            return;
        quoteRequest(JSON.parse(serializedInput)).then(q => { if (!cancelled)
            setResult({ key, quote: q, error: null }); }).catch(e => { if (!cancelled)
            setResult({ key, quote: null, error: e instanceof Error ? e.message : "报价暂不可用" }); });
        return () => { cancelled = true; };
    }, [key, serializedInput, quoteRequest, email]);
    const current = result.key === key ? result.quote : null;
    return { quote: current, cost: current?.credits ?? 0, loading: !!user && !current && !result.error, error: result.error, submit: (url: string, init: RequestInit) => billing.submit(url, init, current) };
}
export function BillingEstimate({ input }: {
    input: QuoteInput;
}) { const state = useBillingEstimate(input); return <span data-testid="billing-estimate" role="status">{state.error || (!state.quote ? "报价加载中…" : `${state.cost} 积分`)}</span>; }
