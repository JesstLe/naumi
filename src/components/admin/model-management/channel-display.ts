import type { ChannelPolicy } from "@/lib/model-config/channel-policy";
import type { ManagedModelRow } from "@/lib/model-config/management";

/** Presentation order only: preserve policy array order as the scheduler's tie breaker. */
export function orderedChannels(channels: ChannelPolicy["channels"]) {
  return channels.map((channel, index) => ({ channel, index }))
    .sort((a, b) => a.channel.priority - b.channel.priority || a.index - b.index)
    .map(({ channel }) => channel);
}

export function orderedRoutes(row: ManagedModelRow, enabled: boolean) {
  const routes = row.routes.filter(route => route.enabled === enabled);
  if (!row.supplierRouting) return routes;
  const order = orderedChannels(row.supplierRouting.channels);
  return routes.map((route, index) => ({ route, index, rank: order.findIndex(c => c.upstreamId === route.upstreamId) }))
    .sort((a, b) => (a.rank < 0 ? Infinity : a.rank) - (b.rank < 0 ? Infinity : b.rank) || a.index - b.index)
    .map(({ route }) => route);
}
