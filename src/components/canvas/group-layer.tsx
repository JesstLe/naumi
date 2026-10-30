"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, type PointerEvent } from "react";
import { ViewportPortal, useReactFlow } from "@xyflow/react";
import { Group, GripVertical } from "lucide-react";
import { CANVAS_GROUP_LAYER_ORDER, canvasGroupFrames, canvasGroupMoves, type CanvasGroupFrame, type CanvasGroupMember, type CanvasGroupMove, type CanvasGroupPoint } from "@/lib/canvas/group-layer";
import { currentWorkspaceRevision, WORKSPACE_SELECTION } from "@/lib/saas/workspace-client";
import styles from "./group-layer.module.css";

type Props = {
  nodes: readonly CanvasGroupMember[];
  disabled?: boolean;
  readOnly?: boolean;
  snap?: boolean;
  english?: boolean;
  onSelect: (ids: string[]) => void;
  onPreview: (moves: CanvasGroupMove[]) => void;
  onCommit: (moves: CanvasGroupMove[]) => void;
};
type Drag = {
  groupId: string;
  pointerId: number;
  target: HTMLElement;
  origin: CanvasGroupPoint;
  screen: CanvasGroupPoint;
  members: Array<{ id: string; position: CanvasGroupPoint }>;
  moves: CanvasGroupMove[];
  moved: boolean;
};

/** A viewport projection, not another node/persistence model. Only the open panel
 * space receives pointers, so image controls, text nodes and edges stay native. */
export function CanvasGroupLayer(props: Props) {
  const { screenToFlowPosition } = useReactFlow();
  const groups = useMemo(() => canvasGroupFrames(props.nodes), [props.nodes]);
  const current = useRef(props); current.current = props;
  const drag = useRef<Drag | null>(null);
  const workspaceRevision = useRef(currentWorkspaceRevision());
  const groupSignature = groups.map(group => `${group.id}:${group.draggable}:${group.members.map(member => member.id).sort().join(",")}`).join("|");

  const finish = useCallback((commit: boolean) => {
    const active = drag.current;
    if (!active) return;
    drag.current = null;
    if (active.target.hasPointerCapture(active.pointerId)) active.target.releasePointerCapture(active.pointerId);
    // Old pointer-up/cancel must not restore old coordinates into a new workspace.
    if (workspaceRevision.current !== currentWorkspaceRevision()) return;
    if (!active.moved) return;
    if (commit && !current.current.disabled && !current.current.readOnly) {
      const changes = active.moves.filter(move => move.from.x !== move.to.x || move.from.y !== move.to.y);
      if (changes.length) current.current.onCommit(changes);
    } else current.current.onPreview(active.members.map(member => ({ id: member.id, from: member.position, to: member.position })));
  }, []);

  // Clear before DOM removal can dispatch lostpointercapture into an old closure.
  useLayoutEffect(() => () => { drag.current = null; }, []);

  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && drag.current) { event.preventDefault(); event.stopPropagation(); finish(false); }
    };
    const changedWorkspace = () => { drag.current = null; };
    window.addEventListener("keydown", escape, true);
    window.addEventListener(WORKSPACE_SELECTION, changedWorkspace);
    return () => { window.removeEventListener("keydown", escape, true); window.removeEventListener(WORKSPACE_SELECTION, changedWorkspace); drag.current = null; };
  }, [finish]);
  useEffect(() => { if (drag.current) finish(false); }, [groupSignature, props.disabled, props.readOnly, finish]);

  function start(event: PointerEvent<HTMLDivElement>, group: CanvasGroupFrame) {
    if (props.disabled || event.button !== 0 || drag.current || workspaceRevision.current !== currentWorkspaceRevision()) return;
    event.stopPropagation();
    props.onSelect(group.members.map(member => member.id));
    if (props.readOnly || !group.draggable) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      groupId: group.id, pointerId: event.pointerId, target: event.currentTarget,
      origin: screenToFlowPosition({ x: event.clientX, y: event.clientY }, { snapToGrid: false }),
      screen: { x: event.clientX, y: event.clientY },
      members: group.members.map(member => ({ id: member.id, position: { ...member.position } })), moves: [], moved: false,
    };
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    const active = drag.current;
    if (!active || active.pointerId !== event.pointerId || workspaceRevision.current !== currentWorkspaceRevision()) return;
    event.stopPropagation();
    if (!active.moved && Math.hypot(event.clientX - active.screen.x, event.clientY - active.screen.y) < 3) return;
    const point = screenToFlowPosition({ x: event.clientX, y: event.clientY }, { snapToGrid: false });
    active.moved = true;
    active.moves = canvasGroupMoves(active.members, { x: point.x - active.origin.x, y: point.y - active.origin.y }, props.snap);
    props.onPreview(active.moves);
  }

  return <ViewportPortal><div className={styles.layer} style={{ zIndex: CANVAS_GROUP_LAYER_ORDER }} data-testid="canvas-group-layer">
    {groups.map(group => <div key={group.id} data-testid="canvas-group-frame" data-canvas-group-id={group.id}
      data-selected={group.selected || undefined} className={`${styles.frame} ${group.selected ? styles.selected : ""}`}
      style={{ transform: `translate(${group.x}px, ${group.y}px)`, width: group.width, height: group.height,
        pointerEvents: props.disabled ? "none" : "auto", cursor: !props.readOnly && group.draggable ? "grab" : "default" }}
      onPointerDown={event => start(event, group)} onPointerMove={move}
      onPointerUp={event => { if (drag.current?.pointerId === event.pointerId) { event.stopPropagation(); finish(true); } }}
      onPointerCancel={() => finish(false)} onLostPointerCapture={() => finish(false)}
      onClick={event => event.stopPropagation()}>
      <button type="button" className={`${styles.label} nodrag nopan`} disabled={props.disabled}
        aria-label={props.english ? `Select group of ${group.members.length} images` : `选择分组（${group.members.length} 张图片）`}
        onClick={event => { event.stopPropagation(); if (workspaceRevision.current === currentWorkspaceRevision()) props.onSelect(group.members.map(member => member.id)); }}>
        <GripVertical size={13} aria-hidden="true"/><Group size={14} aria-hidden="true"/>
        <span>{props.english ? "Group" : "组合"}</span><span className={styles.count}>{group.members.length}</span>
      </button>
    </div>)}
  </div></ViewportPortal>;
}
