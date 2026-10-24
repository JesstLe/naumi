import "server-only";
import type OpenAI from "openai";

const managedClients = new WeakSet<OpenAI>();
export const isManagedModelClient = (client: OpenAI) => managedClients.has(client);
export function markManagedModelClient(client: OpenAI) { managedClients.add(client); }
