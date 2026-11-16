/** Job labels never grant permissions or replace enterprise role IDs. */
export const USER_POSITIONS = ["", "电商设计-资深", "电商设计-美工", "包装设计"] as const;
export type UserPosition = (typeof USER_POSITIONS)[number];
export const USER_POSITION_FILTERS = [...USER_POSITIONS, "unassigned"] as const;
export function matchesUserPosition(position: string | null | undefined, filter: string) {
  return filter === "" || (USER_POSITION_FILTERS as readonly string[]).includes(filter) && (position || "") === (filter === "unassigned" ? "" : filter);
}
