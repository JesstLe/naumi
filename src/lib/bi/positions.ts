/** Admin-managed job labels, independent of permissions and enterprise role IDs. */
export const USER_POSITIONS = ["", "电商设计-资深", "电商设计-美工", "包装设计"] as const;
export type UserPosition = (typeof USER_POSITIONS)[number];
export const USER_POSITION_FILTERS = [...USER_POSITIONS, "unassigned"] as const;
