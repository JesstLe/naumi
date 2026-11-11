import entries from "./catalog.json";

/** Public editorial examples, not user templates or generated artwork records. */
export interface CreationCase {
  id: string;
  kind: "image" | "video";
  title: string;
  category: string;
  tags: string[];
  poster: string;
  width: number;
  height: number;
  video?: string;
  duration?: number;
  prompt: string;
  steps: string[];
  source: {
    title: string;
    author: string;
    promptAuthor?: string;
    url: string;
    license: string;
    licenseUrl: string;
  };
  adaptation: string;
}

export const CREATION_CASES: readonly CreationCase[] = entries as CreationCase[];

export function findCreationCase(id: string | undefined, kind?: CreationCase["kind"]) {
  return CREATION_CASES.find(item => item.id === id && (!kind || item.kind === kind));
}

/** Seed only an editable prompt; never select a supplier, submit, or import media. */
export function creationCaseHref(item: CreationCase) {
  if (item.kind === "video") return `/video?case=${encodeURIComponent(item.id)}`;
  return `/generate?${new URLSearchParams({ prompt: item.prompt }).toString()}`;
}

export function filterCreationCases(kind: "all" | CreationCase["kind"], category: string, query: string) {
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return CREATION_CASES.filter(item => (kind === "all" || item.kind === kind)
    && (!category || item.category === category)
    && words.every(word => [item.title, item.category, ...item.tags, item.source.author].join(" ").toLocaleLowerCase().includes(word)));
}
