"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export const TEXT_MODEL_STORAGE_KEY = "naumi:text-model";

type TextModelState = {
  model: string;
  models: string[];
  defaultModel: string;
  loaded: boolean;
  setModel: (model: string) => void;
};

const TextModelContext = createContext<TextModelState | null>(null);

export function TextModelProvider({ children }: { children: ReactNode }) {
  const [model, setModelState] = useState("gpt-5.6-luna");
  const [models, setModels] = useState<string[]>(["gpt-5.6-luna"]);
  const [defaultModel, setDefaultModel] = useState("gpt-5.6-luna");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const saved = window.localStorage.getItem(TEXT_MODEL_STORAGE_KEY)?.trim();
    if (saved) setModelState(saved);
    void fetch("/api/text-models", { cache: "no-store" })
      .then((response) => response.json())
      .then((data: { defaultModel?: string; models?: string[] }) => {
        if (cancelled) return;
        const nextDefault = String(data.defaultModel || "gpt-5.6-luna");
        const list = Array.from(
          new Set([nextDefault, ...(Array.isArray(data.models) ? data.models : []), ...(saved ? [saved] : [])])
        ).filter(Boolean);
        setDefaultModel(nextDefault);
        setModels(list);
        if (!saved) setModelState(nextDefault);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const setModel = useCallback((next: string) => {
    const normalized = next.trim();
    if (!normalized) return;
    setModelState(normalized);
    setModels((current) => (current.includes(normalized) ? current : [normalized, ...current]));
    window.localStorage.setItem(TEXT_MODEL_STORAGE_KEY, normalized);
  }, []);

  const value = useMemo(
    () => ({ model, models, defaultModel, loaded, setModel }),
    [model, models, defaultModel, loaded, setModel]
  );
  return <TextModelContext.Provider value={value}>{children}</TextModelContext.Provider>;
}

export function useTextModel(): TextModelState {
  const value = useContext(TextModelContext);
  if (!value) throw new Error("useTextModel must be used inside TextModelProvider");
  return value;
}

