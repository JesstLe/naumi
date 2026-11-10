export type AgentEvent = { type: string; at: number; data: Record<string, unknown>; sequence?: number };
export type AgentEventBuffer = { events: AgentEvent[] };

/** Upgrade legacy snapshots once; persisted sequence numbers survive filtering,
 * pruning and process changes. A cursor is never an array offset. */
export function normalizeAgentEvents(events: AgentEvent[]) {
  let previous = 0;
  for (const event of events) {
    if (!Number.isSafeInteger(event.sequence) || event.sequence! <= previous) event.sequence = previous + 1;
    previous = event.sequence!;
  }
  return events;
}
export function agentEventCursor(buffer: AgentEventBuffer) {
  normalizeAgentEvents(buffer.events);
  return buffer.events.at(-1)?.sequence ?? 0;
}
export function appendAgentEvent(buffer: AgentEventBuffer, event: AgentEvent) {
  event.sequence = agentEventCursor(buffer) + 1;
  buffer.events.push(event);
  if (buffer.events.length > 400) buffer.events.splice(0, 200);
}
export function agentEventsSince(buffer: AgentEventBuffer, since: number) {
  const total = agentEventCursor(buffer), first = buffer.events[0]?.sequence ?? 1;
  const reset = since > total || since < first - 1;
  return { events: buffer.events.filter(event => event.sequence! > (since > total ? 0 : since)), total, reset };
}
