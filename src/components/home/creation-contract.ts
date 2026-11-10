import type { ImageSkill } from "@/lib/image-skills/catalog";
import type { WorkbenchMessage, WorkbenchSessionSummary } from "@/lib/agent/workbench-contract";

/** Presentation port. The existing Agent application owner retains every
 * admission, recovery, account fence, stream and persistence decision. */
export type CreationWorkbenchPort = {
  conversation: boolean;
  messages: WorkbenchMessage[];
  sessions: WorkbenchSessionSummary[];
  sessionsLoading: boolean;
  sessionId: string;
  title: string;
  loadingId: string;
  busy: boolean;
  running: boolean;
  unavailable: boolean;
  uploading: boolean;
  error: string | null;
  text: string;
  refs: string[];
  skill: ImageSkill | null;
  recent: {id:string;image:string;title?:string}[] | null;
  canNavigate: boolean;
  setText(value: string): void;
  setSkill(value: ImageSkill | null): void;
  addFiles(files: File[]): void;
  addReference(url: string): void;
  removeRef(index: number): void;
  stage(text: string, refs?: string[]): void;
  send(): void;
  regenerate(text:string,refs:string[]):void;
  stop(): void;
  interject(text: string): void;
  create(): void;
  load(id: string): void;
  history(): void;
  resolveArtwork(url: string): Promise<string | null>;
};
